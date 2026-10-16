import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchPitcherSeasonPitches,
  type SavantPitchRow,
} from "@/lib/savant/client";

// Archive read-through for seasons we no longer cache.
//
// Retention keeps only the newest season's pitch rows in Postgres (see
// lib/season/current-season.ts), and the write guard in backfill.ts
// deliberately refuses to persist anything older so that on-demand
// backfills don't write rows the nightly eviction cron deletes hours
// later. The side effect was that prior seasons became unreachable:
// /pitcher/694973/paul-skenes?season=2025 rendered "No arsenal data for
// 2025" even though Savant still serves 2,996 rows for it, and the
// season picker on that page went on offering 2025 and 2024.
//
// This module restores the access without reintroducing the thrash, by
// not persisting at all: fetch from Savant, shape it in memory, and let
// Next's data cache absorb the repeat views. Storage cost is zero and
// there is nothing for the eviction cron to fight over.
//
// Same approach as api/search/route.ts, which already does a cached
// Savant read-through for the explore page.

// Statcast occasionally publishes retroactive corrections, but a
// finished season is otherwise immutable, so this can be cached hard.
// Matches the 6h used by the search read-through.
const ARCHIVE_REVALIDATE_S = 60 * 60 * 6;

/** Game metadata the pitcher page expects embedded on each pitch row. */
export interface ArchiveEmbeddedGame {
  season: number;
  game_date: string;
  home_team_id: number | null;
  away_team_id: number | null;
  game_type: string | null;
}

/**
 * A pitch row shaped like the pitcher page's `PITCH_SELECT` result, so
 * the archive path and the Postgres path are interchangeable
 * downstream.
 */
export interface ArchivePitchRow {
  game_pk: number;
  at_bat_number: number;
  pitch_number: number;
  pitch_type: string | null;
  stand: string | null;
  batter_id: number | null;
  description: string | null;
  events: string | null;
  /** Run-expectancy delta; the stats view's run-value columns use it. */
  delta_run_exp: number | null;
  release_pos_x: number | null;
  release_pos_y: number | null;
  release_pos_z: number | null;
  vx0: number | null;
  vy0: number | null;
  vz0: number | null;
  ax: number | null;
  ay: number | null;
  az: number | null;
  plate_x: number | null;
  plate_z: number | null;
  release_speed: number | null;
  release_spin_rate: number | null;
  spin_axis: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
  release_extension: number | null;
  pitch_games: ArchiveEmbeddedGame;
}

export interface ArchiveArsenalRow {
  pitch_type: string;
  pitch_count: number;
  avg_velocity: number | null;
}

export interface ArchiveGameMeta {
  game_pk: number;
  game_date: string;
  home_team_id: number | null;
  away_team_id: number | null;
}

export interface ArchiveSeason {
  pitches: ArchivePitchRow[];
  arsenal: ArchiveArsenalRow[];
  games: ArchiveGameMeta[];
}

/** Narrow a Savant value to a finite number, or null. */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Narrow a Savant value to a non-empty string, or null. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Savant reports teams as abbreviations ("NYY"), while every consumer
 * here wants MLB's numeric team id. pitch_teams is 30 rows and is
 * never evicted, so this stays available for archived seasons.
 */
async function loadTeamIdByAbbrev(): Promise<Map<string, number>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("pitch_teams")
    .select("abbreviation, mlb_id");
  const map = new Map<string, number>();
  for (const t of data ?? []) {
    if (t.abbreviation) map.set(t.abbreviation, t.mlb_id);
  }
  return map;
}

function shapeArchiveSeason(
  rows: SavantPitchRow[],
  season: number,
  teamIdByAbbrev: Map<string, number>,
): ArchiveSeason {
  const pitches: ArchivePitchRow[] = rows.map((p) => {
    const home = p.home_team ? teamIdByAbbrev.get(p.home_team) ?? null : null;
    const away = p.away_team ? teamIdByAbbrev.get(p.away_team) ?? null : null;
    return {
      game_pk: p.game_pk,
      at_bat_number: p.at_bat_number,
      pitch_number: p.pitch_number,
      pitch_type: str(p.pitch_type),
      stand: str(p.stand),
      batter_id: num(p.batter),
      description: str(p.description),
      events: str(p.events),
      delta_run_exp: num(p.delta_run_exp),
      release_pos_x: num(p.release_pos_x),
      release_pos_y: num(p.release_pos_y),
      release_pos_z: num(p.release_pos_z),
      vx0: num(p.vx0),
      vy0: num(p.vy0),
      vz0: num(p.vz0),
      ax: num(p.ax),
      ay: num(p.ay),
      az: num(p.az),
      plate_x: num(p.plate_x),
      plate_z: num(p.plate_z),
      release_speed: num(p.release_speed),
      release_spin_rate: num(p.release_spin_rate),
      spin_axis: num(p.spin_axis),
      pfx_x: num(p.pfx_x),
      pfx_z: num(p.pfx_z),
      release_extension: num(p.release_extension),
      pitch_games: {
        season,
        game_date: p.game_date.slice(0, 10),
        home_team_id: home,
        away_team_id: away,
        game_type: str(p.game_type),
      },
    };
  });

  // Match the Postgres path's ordering so pitch indices referenced by
  // ?pitch= and the 3D scene line up between the two sources.
  pitches.sort(
    (a, b) =>
      a.game_pk - b.game_pk ||
      a.at_bat_number - b.at_bat_number ||
      a.pitch_number - b.pitch_number,
  );

  // Arsenal: same shape pitch_pitcher_aggregates returns for
  // batter_hand "*" — count plus mean velocity per pitch type,
  // heaviest first.
  const byType = new Map<string, { count: number; veloSum: number; veloN: number }>();
  for (const p of pitches) {
    if (!p.pitch_type) continue;
    const e = byType.get(p.pitch_type) ?? { count: 0, veloSum: 0, veloN: 0 };
    e.count += 1;
    if (p.release_speed !== null) {
      e.veloSum += p.release_speed;
      e.veloN += 1;
    }
    byType.set(p.pitch_type, e);
  }
  const arsenal: ArchiveArsenalRow[] = Array.from(byType.entries())
    .map(([pitch_type, e]) => ({
      pitch_type,
      pitch_count: e.count,
      avg_velocity: e.veloN > 0 ? e.veloSum / e.veloN : null,
    }))
    .sort((a, b) => b.pitch_count - a.pitch_count);

  // Game list, deduped by game_pk, newest first to match how the
  // page's game picker presents them.
  const gameByPk = new Map<number, ArchiveGameMeta>();
  for (const p of pitches) {
    if (gameByPk.has(p.game_pk)) continue;
    gameByPk.set(p.game_pk, {
      game_pk: p.game_pk,
      game_date: p.pitch_games.game_date,
      home_team_id: p.pitch_games.home_team_id,
      away_team_id: p.pitch_games.away_team_id,
    });
  }
  const games = Array.from(gameByPk.values()).sort((a, b) =>
    b.game_date.localeCompare(a.game_date),
  );

  return { pitches, arsenal, games };
}

const cachedArchiveSeason = unstable_cache(
  async (pitcherId: number, season: number): Promise<ArchiveSeason> => {
    const [rows, teamIdByAbbrev] = await Promise.all([
      fetchPitcherSeasonPitches(pitcherId, season),
      loadTeamIdByAbbrev(),
    ]);
    return shapeArchiveSeason(rows, season, teamIdByAbbrev);
  },
  ["archive-season"],
  { revalidate: ARCHIVE_REVALIDATE_S, tags: ["archive-season"] },
);

/**
 * Load a pitcher's season straight from Savant, shaped like the
 * Postgres reads it replaces. Nothing is written to the database.
 *
 * Returns an empty ArchiveSeason rather than throwing when Savant is
 * unreachable, so a failed upstream degrades to the same empty state
 * the page showed before instead of a 500.
 */
export async function loadArchiveSeason(
  pitcherId: number,
  season: number,
): Promise<ArchiveSeason> {
  try {
    return await cachedArchiveSeason(pitcherId, season);
  } catch (err) {
    console.error(
      `[archive-season] Savant read-through failed for pitcher ${pitcherId} season ${season}:`,
      err,
    );
    return { pitches: [], arsenal: [], games: [] };
  }
}

/**
 * Apply the pitcher page's row-level filters in memory.
 *
 * The Postgres path pushes these into the query; the archive path has
 * the whole season in hand, so it filters here. Kept in one function so
 * the two paths can't drift on what `?hand=`, `?game=` and `?vsBatter=`
 * mean.
 */
export function filterArchivePitches(
  pitches: ArchivePitchRow[],
  filters: {
    hand?: string | null;
    gamePk?: number | null;
    vsBatterId?: number | null;
  },
): ArchivePitchRow[] {
  const { hand, gamePk, vsBatterId } = filters;
  return pitches.filter((p) => {
    if ((hand === "L" || hand === "R") && p.stand !== hand) return false;
    if (typeof gamePk === "number" && p.game_pk !== gamePk) return false;
    if (typeof vsBatterId === "number" && p.batter_id !== vsBatterId) {
      return false;
    }
    return true;
  });
}

/** Exported for tests — shaping is pure given its inputs. */
export const __testables = { shapeArchiveSeason };
