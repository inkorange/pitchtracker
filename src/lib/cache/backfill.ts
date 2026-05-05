// On-demand backfill: when a page asks for a pitcher × season that has
// no cached data, fetch the pitcher's full season from Savant and write
// it through. Triggered server-side from the page render so the user
// just waits a beat on first visit instead of seeing an empty state.

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPitcherSeasonPitches } from "@/lib/savant/client";
import { fetchSchedule } from "@/lib/statsapi/client";
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

  // Make sure we have games for this season at all. Without them, every
  // pitch insert would fail the FK on game_pk.
  const { count: seasonGameCount } = await supabase
    .from("pitch_games")
    .select("*", { count: "exact", head: true })
    .eq("season", season);
  if (!seasonGameCount || seasonGameCount === 0) {
    await backfillSeasonSchedule(season);
  }

  // Now check whether we already have any pitches for this pitcher in
  // this season's games.
  const { data: seasonGameRows } = await supabase
    .from("pitch_games")
    .select("game_pk")
    .eq("season", season);
  const seasonGamePks = new Set((seasonGameRows ?? []).map((g) => g.game_pk));
  if (seasonGamePks.size === 0) {
    // Schedule backfill produced nothing — give up silently.
    return;
  }

  const { count: pitchCount } = await supabase
    .from("pitch_game_pitches")
    .select("*", { count: "exact", head: true })
    .eq("pitcher_id", pitcherId)
    .in("game_pk", Array.from(seasonGamePks));
  if ((pitchCount ?? 0) > 0) return; // already cached

  // Pull from Savant.
  let fresh;
  try {
    fresh = await fetchPitcherSeasonPitches(pitcherId, season);
  } catch {
    return; // Savant unavailable — leave the page empty.
  }
  if (fresh.length === 0) return;

  // Filter to game_pks we have in pitch_games (FK requirement) and to
  // pitcher_id == this pitcher (Savant returns related-pitch context too,
  // but we stay scoped). Also null out any unknown opposing pitcher_ids.
  const { data: knownPitchers } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id");
  const knownPitcherIds = new Set((knownPitchers ?? []).map((p) => p.mlb_id));

  const rows: TablesInsert<"pitch_game_pitches">[] = fresh
    .filter((p) => seasonGamePks.has(p.game_pk))
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

  // Recompute aggregates so the arsenal panel populates.
  await supabase.rpc("pitch_recompute_aggregates");
}

// Pull the regular-season + spring-training MLB schedule for the given
// season into pitch_games. Same logic as the refresh-games cron, but
// scoped to one season and inline so the page can call it without a
// network round-trip.
async function backfillSeasonSchedule(season: number): Promise<void> {
  const supabase = createAdminClient();
  const games = await fetchSchedule(`${season}-02-15`, `${season}-11-15`);

  const { data: teamRows } = await supabase.from("pitch_teams").select("mlb_id");
  const validTeamIds = new Set((teamRows ?? []).map((t) => t.mlb_id));

  const byPk = new Map<number, (typeof games)[number]>();
  for (const g of games) {
    if (!validTeamIds.has(g.teams.home.team.id) || !validTeamIds.has(g.teams.away.team.id)) {
      continue;
    }
    byPk.set(g.gamePk, g);
  }

  const rows = Array.from(byPk.values()).map((g) => ({
    game_pk: g.gamePk,
    game_date: g.gameDate.slice(0, 10),
    season: Number(g.gameDate.slice(0, 4)),
    home_team_id: g.teams.home.team.id,
    away_team_id: g.teams.away.team.id,
    status: g.status.detailedState ?? g.status.abstractGameState ?? "Unknown",
    venue_name: g.venue?.name ?? null,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await supabase.from("pitch_games").upsert(chunk);
  }
}
