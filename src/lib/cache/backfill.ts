// On-demand backfill: when a page asks for a pitcher × season that has
// no cached data, fetch the pitcher's full season from Savant and write
// it through. Triggered server-side from the page render so the user
// just waits a beat on first visit instead of seeing an empty state.

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPitcherSeasonPitches } from "@/lib/savant/client";
import type { TablesInsert } from "@/lib/supabase/types";

// Cheap in-process cache so we don't fire the same backfill multiple
// times during a single server render (the compare page calls per side).
const inFlight = new Map<string, Promise<void>>();

export async function ensurePitcherSeasonCache(
  pitcherId: number,
  season: number,
): Promise<void> {
  const key = `${pitcherId}:${season}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = doEnsure(pitcherId, season).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function doEnsure(pitcherId: number, season: number): Promise<void> {
  const supabase = createAdminClient();

  // "Already cached?" check via the pitch_pitcher_games mapping table.
  // This is the small per-pitcher mapping (~30-80 rows/season), so the
  // join filter on pitch_games.season returns only this pitcher's games
  // in the active season — no row-cap risk.
  const { data: existingPitcherGames } = await supabase
    .from("pitch_pitcher_games")
    .select("game_pk, pitch_games!inner(season)")
    .eq("pitcher_id", pitcherId)
    .eq("pitch_games.season", season);
  if ((existingPitcherGames ?? []).length > 0) return;

  // Pull from Savant.
  let fresh;
  try {
    fresh = await fetchPitcherSeasonPitches(pitcherId, season);
  } catch {
    return; // Savant unavailable — leave the page empty.
  }
  if (fresh.length === 0) return;

  // Pitches FK to pitch_games. Insert only the games this pitcher
  // actually appeared in, building rows from Savant's own response so we
  // never have to load the full season schedule. Game metadata lives on
  // every pitch row in the CSV (game_date, home_team, away_team), so
  // we just dedupe by game_pk.
  const { data: teamRows } = await supabase
    .from("pitch_teams")
    .select("mlb_id, abbreviation");
  const teamIdByAbbrev = new Map<string, number>(
    (teamRows ?? []).map((t) => [t.abbreviation, t.mlb_id]),
  );

  type GameInsert = TablesInsert<"pitch_games">;
  const gameByPk = new Map<number, GameInsert>();
  for (const p of fresh) {
    if (gameByPk.has(p.game_pk)) continue;
    const homeId = p.home_team ? (teamIdByAbbrev.get(p.home_team) ?? null) : null;
    const awayId = p.away_team ? (teamIdByAbbrev.get(p.away_team) ?? null) : null;
    gameByPk.set(p.game_pk, {
      game_pk: p.game_pk,
      game_date: p.game_date.slice(0, 10),
      season,
      home_team_id: homeId,
      away_team_id: awayId,
      status: "Scheduled",
      // game_type comes straight from Savant's CSV. Savant URL filter
      // limits this fetcher to R only, but capture whatever lands so a
      // wider future query (e.g. postseason) records accurately.
      game_type: p.game_type ?? null,
      venue_name: null,
      updated_at: new Date().toISOString(),
    });
  }
  const gameRows = Array.from(gameByPk.values());
  for (let i = 0; i < gameRows.length; i += 200) {
    const chunk = gameRows.slice(i, i + 200);
    await supabase.from("pitch_games").upsert(chunk);
  }
  const knownGamePks = new Set(gameRows.map((g) => g.game_pk));

  // Filter to game_pks we have in pitch_games (FK requirement) and to
  // pitcher_id == this pitcher (Savant returns related-pitch context too,
  // but we stay scoped). Also null out any unknown opposing pitcher_ids.
  const { data: knownPitchers } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id");
  const knownPitcherIds = new Set((knownPitchers ?? []).map((p) => p.mlb_id));

  const rows: TablesInsert<"pitch_game_pitches">[] = fresh
    .filter((p) => knownGamePks.has(p.game_pk))
    .map((p) => ({
      game_pk: p.game_pk,
      at_bat_number: p.at_bat_number,
      pitch_number: p.pitch_number,
      pitcher_id: knownPitcherIds.has(p.pitcher) ? p.pitcher : null,
      batter_id: p.batter,
      pitch_type: p.pitch_type ?? null,
      pitch_name: p.pitch_name ?? null,
      description: p.description ?? null,
      events: p.events ?? null,
      balls: p.balls,
      strikes: p.strikes,
      outs_when_up: p.outs_when_up,
      inning: p.inning,
      inning_topbot: p.inning_topbot,
      stand: (p as unknown as { stand?: string }).stand ?? null,
      p_throws: (p as unknown as { p_throws?: string }).p_throws ?? null,
      on_1b: p.on_1b,
      on_2b: p.on_2b,
      on_3b: p.on_3b,
      release_pos_x: p.release_pos_x,
      release_pos_y: p.release_pos_y,
      release_pos_z: p.release_pos_z,
      vx0: p.vx0,
      vy0: p.vy0,
      vz0: p.vz0,
      ax: p.ax,
      ay: p.ay,
      az: p.az,
      plate_x: p.plate_x,
      plate_z: p.plate_z,
      release_speed: p.release_speed,
      release_spin_rate: p.release_spin_rate ?? null,
      spin_axis: p.spin_axis ?? null,
      pfx_x: p.pfx_x ?? null,
      pfx_z: p.pfx_z ?? null,
      effective_speed: p.effective_speed,
      release_extension: p.release_extension,
      delta_run_exp: p.delta_run_exp,
      delta_home_win_exp: p.delta_home_win_exp,
    }));

  if (rows.length === 0) return;

  // Upsert in chunks of 200 to stay under Postgres parameter limits.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await supabase.from("pitch_game_pitches").upsert(chunk);
  }

  // Mirror the pitcher × game pairs into the mapping table so the
  // dropdown can be queried directly without scanning pitches.
  const pitcherGameRows: TablesInsert<"pitch_pitcher_games">[] = Array.from(
    gameByPk.keys(),
  ).map((gpk) => ({ pitcher_id: pitcherId, game_pk: gpk }));
  for (let i = 0; i < pitcherGameRows.length; i += 200) {
    const chunk = pitcherGameRows.slice(i, i + 200);
    await supabase.from("pitch_pitcher_games").upsert(chunk);
  }

  // Recompute aggregates so the arsenal panel populates.
  await supabase.rpc("pitch_recompute_aggregates");
}

