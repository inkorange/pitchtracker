// On-demand backfill: when a page asks for a pitcher × season that has
// no cached data, fetch the pitcher's full season from Savant and write
// it through. Triggered server-side from the page render so the user
// just waits a beat on first visit instead of seeing an empty state.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchGamePitches,
  fetchPitcherSeasonPitches,
  type SavantPitchRow,
} from "@/lib/savant/client";
import type { TablesInsert } from "@/lib/supabase/types";

// Cheap in-process cache so we don't fire the same backfill multiple
// times during a single server render (the compare page calls per side).
const inFlight = new Map<string, Promise<void>>();

export async function ensurePitcherSeasonCache(
  pitcherId: number,
  season: number,
  opts: { force?: boolean; skipRecompute?: boolean } = {},
): Promise<void> {
  const key = `${pitcherId}:${season}:${opts.force ? "force" : "lazy"}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = doEnsure(
    pitcherId,
    season,
    opts.force === true,
    opts.skipRecompute === true,
  ).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function doEnsure(
  pitcherId: number,
  season: number,
  force: boolean,
  skipRecompute: boolean,
): Promise<void> {
  const supabase = createAdminClient();

  // "Already cached?" check via the pitch_pitcher_games mapping table.
  // This is the small per-pitcher mapping (~30-80 rows/season), so the
  // join filter on pitch_games.season returns only this pitcher's games
  // in the active season — no row-cap risk.
  //
  // The lazy path (page-render demand-load) skips fully-cached pitchers
  // because their data is good enough for browsing. The forced path
  // (daily precache cron) always refetches so we pick up new games the
  // pitcher's appeared in since the cache was first populated —
  // otherwise the rankings get permanently frozen at the first cached
  // snapshot per pitcher.
  if (!force) {
    const { data: existingPitcherGames } = await supabase
      .from("pitch_pitcher_games")
      .select("game_pk, pitch_games!inner(season)")
      .eq("pitcher_id", pitcherId)
      .eq("pitch_games.season", season);
    if ((existingPitcherGames ?? []).length > 0) return;
  }

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
      description: p.description ?? null,
      events: p.events ?? null,
      balls: p.balls,
      strikes: p.strikes,
      outs_when_up: p.outs_when_up,
      inning: p.inning,
      inning_topbot: p.inning_topbot,
      stand: (p as unknown as { stand?: string }).stand ?? null,
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
      release_extension: p.release_extension,
      delta_run_exp: p.delta_run_exp,
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

  // Recompute aggregates so the arsenal panel populates. Cron callers
  // pass skipRecompute=true and rely on the dedicated refresh-aggregates
  // cron — recomputing per-pitcher inside a batch loop is what was
  // pushing the precache function over its timeout.
  if (!skipRecompute) {
    await supabase.rpc("pitch_recompute_aggregates");
  }
}

// On-demand cache for a single game. Used by the team+date lookup
// flow so users can land on any scheduled game and have its pitches
// pulled from Savant on first visit, rather than dead-ending on a
// "no pitches" stub. Also called by the precache-recent-games cron
// with force=true to re-pull today/yesterday's games (in case the
// earlier fetch landed mid-game and missed late innings).
export async function ensureGameCache(
  gamePk: number,
  opts: { force?: boolean; skipRecompute?: boolean } = {},
): Promise<void> {
  const key = `game:${gamePk}:${opts.force ? "force" : "lazy"}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = doEnsureGame(
    gamePk,
    opts.force === true,
    opts.skipRecompute === true,
  ).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function doEnsureGame(
  gamePk: number,
  force: boolean,
  skipRecompute: boolean,
): Promise<void> {
  const supabase = createAdminClient();

  // Already have pitches for this game? bail out cheaply, unless the
  // caller forced a re-pull (e.g. the daily cron refreshing today and
  // yesterday's games in case the prior fetch was mid-game).
  if (!force) {
    const { data: existing } = await supabase
      .from("pitch_pitcher_games")
      .select("game_pk")
      .eq("game_pk", gamePk)
      .limit(1);
    if ((existing ?? []).length > 0) return;
  }

  let fresh: SavantPitchRow[];
  try {
    fresh = await fetchGamePitches(gamePk);
  } catch {
    return;
  }
  if (fresh.length === 0) return;

  // Make sure the game row exists (FK requirement). The schedule
  // refresh cron usually populates pitch_games, but be defensive: if
  // the row is missing, synthesize one from the first pitch's game
  // metadata. Teams will be filled in by the next schedule refresh.
  const { data: knownGame } = await supabase
    .from("pitch_games")
    .select("game_pk")
    .eq("game_pk", gamePk)
    .maybeSingle();
  if (!knownGame) {
    const first = fresh[0];
    const teamRows = await supabase.from("pitch_teams").select("mlb_id, abbreviation");
    const teamIdByAbbrev = new Map<string, number>(
      (teamRows.data ?? []).map((t) => [t.abbreviation, t.mlb_id]),
    );
    const homeId = first.home_team ? (teamIdByAbbrev.get(first.home_team) ?? null) : null;
    const awayId = first.away_team ? (teamIdByAbbrev.get(first.away_team) ?? null) : null;
    await supabase.from("pitch_games").upsert({
      game_pk: gamePk,
      game_date: first.game_date.slice(0, 10),
      season: Number(first.game_date.slice(0, 4)),
      home_team_id: homeId,
      away_team_id: awayId,
      status: "Scheduled",
      game_type: first.game_type ?? null,
      venue_name: null,
      updated_at: new Date().toISOString(),
    });
  }

  // Filter pitcher_id to known pitchers (FK requirement); unknown
  // batters are stored as their raw mlb_id (no FK on batter_id).
  const { data: knownPitchers } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id");
  const knownPitcherIds = new Set((knownPitchers ?? []).map((p) => p.mlb_id));

  const rows: TablesInsert<"pitch_game_pitches">[] = fresh.map((p) => ({
    game_pk: p.game_pk,
    at_bat_number: p.at_bat_number,
    pitch_number: p.pitch_number,
    pitcher_id: knownPitcherIds.has(p.pitcher) ? p.pitcher : null,
    batter_id: p.batter,
    pitch_type: p.pitch_type ?? null,
    description: p.description ?? null,
    events: p.events ?? null,
    balls: p.balls,
    strikes: p.strikes,
    outs_when_up: p.outs_when_up,
    inning: p.inning,
    inning_topbot: p.inning_topbot,
    stand: (p as unknown as { stand?: string }).stand ?? null,
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
    release_extension: p.release_extension,
    delta_run_exp: p.delta_run_exp,
  }));

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await supabase.from("pitch_game_pitches").upsert(chunk);
  }

  // Mirror (pitcher_id, game_pk) into pitch_pitcher_games so the
  // dropdown logic and the date-filtered listing pick it up.
  const distinctPairs = new Map<string, TablesInsert<"pitch_pitcher_games">>();
  for (const r of rows) {
    if (r.pitcher_id == null) continue;
    const k = `${r.pitcher_id}:${r.game_pk}`;
    if (!distinctPairs.has(k)) {
      distinctPairs.set(k, { pitcher_id: r.pitcher_id, game_pk: r.game_pk });
    }
  }
  const ppgRows = Array.from(distinctPairs.values());
  for (let i = 0; i < ppgRows.length; i += 200) {
    const chunk = ppgRows.slice(i, i + 200);
    await supabase.from("pitch_pitcher_games").upsert(chunk);
  }

  // Same skip rule as the per-pitcher path: cron callers opt out so the
  // batch loop doesn't pay 1× full recompute per game.
  if (!skipRecompute) {
    await supabase.rpc("pitch_recompute_aggregates");
  }
}

