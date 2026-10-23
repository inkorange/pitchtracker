import { unstable_cache } from "next/cache";
import { fetchGamePitches, type SavantPitchRow } from "@/lib/savant/client";

// A single game's pitches, read from Savant on demand rather than from
// pitch_game_pitches.
//
// The per-season counterpart is lib/cache/savant-season.ts; this is the
// game-scoped one, for the at-bat replay pages, the game page, the
// pitches API and the daily-picks cron. A completed game is immutable,
// so it caches hard.
//
// Together these two remove the last readers of pitch_game_pitches,
// which is what lets the table — and the nightly upsert that was 48% of
// the database's WAL — go away entirely.

// Statcast can publish a correction for a very recent game, and an
// in-progress game changes continuously, so this is shorter than the
// 6h used for finished seasons. Still long enough that a crawler
// sweeping at-bat URLs for one game costs a single upstream request.
const GAME_REVALIDATE_S = 60 * 15;

/**
 * One pitch, shaped like the `pitch_game_pitches` row the at-bat pages
 * selected, so consumers are source-agnostic.
 */
export interface SavantGamePitchRow {
  game_pk: number;
  at_bat_number: number;
  pitch_number: number;
  pitcher_id: number | null;
  batter_id: number | null;
  pitch_type: string | null;
  description: string | null;
  events: string | null;
  balls: number | null;
  strikes: number | null;
  outs_when_up: number | null;
  inning: number | null;
  inning_topbot: string | null;
  stand: string | null;
  on_1b: number | null;
  on_2b: number | null;
  on_3b: number | null;
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
  delta_run_exp: number | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Pure mapper, exported for tests. */
export function shapeGamePitches(
  rows: SavantPitchRow[],
): SavantGamePitchRow[] {
  return rows
    .map((p) => ({
      game_pk: p.game_pk,
      at_bat_number: p.at_bat_number,
      pitch_number: p.pitch_number,
      pitcher_id: num(p.pitcher),
      batter_id: num(p.batter),
      pitch_type: str(p.pitch_type),
      description: str(p.description),
      events: str(p.events),
      balls: num(p.balls),
      strikes: num(p.strikes),
      outs_when_up: num(p.outs_when_up),
      inning: num(p.inning),
      inning_topbot: str(p.inning_topbot),
      stand: str(p.stand),
      on_1b: num(p.on_1b),
      on_2b: num(p.on_2b),
      on_3b: num(p.on_3b),
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
      delta_run_exp: num(p.delta_run_exp),
    }))
    // Match the ordering every SQL consumer used, since ?pitch= and the
    // 3D scene index into these arrays.
    .sort(
      (a, b) =>
        a.at_bat_number - b.at_bat_number || a.pitch_number - b.pitch_number,
    );
}

const cachedGamePitches = unstable_cache(
  async (gamePk: number): Promise<SavantGamePitchRow[]> =>
    shapeGamePitches(await fetchGamePitches(gamePk)),
  ["savant-game-pitches"],
  { revalidate: GAME_REVALIDATE_S, tags: ["savant-game"] },
);

/**
 * Every pitch of one game.
 *
 * Returns an empty array rather than throwing when Savant is
 * unreachable or the game has no Statcast yet, which is the same empty
 * state the pages already render for an uncached game.
 */
export async function loadGamePitches(
  gamePk: number,
): Promise<SavantGamePitchRow[]> {
  try {
    return await cachedGamePitches(gamePk);
  } catch (err) {
    console.error(`[savant-game] fetch failed for game ${gamePk}:`, err);
    return [];
  }
}

/** Just one at-bat from a game, for the replay pages. */
export async function loadAtBatPitches(
  gamePk: number,
  atBatNumber: number,
): Promise<SavantGamePitchRow[]> {
  const all = await loadGamePitches(gamePk);
  return all.filter((p) => p.at_bat_number === atBatNumber);
}

/**
 * Pitches across several games, fetched concurrently.
 *
 * Used by the daily-picks cron, which scores recent at-bats and
 * previously scanned pitch_game_pitches in paginated chunks. A day of
 * MLB is ~15 games, so this is ~15 cached requests rather than a
 * table scan.
 */
export async function loadGamesPitches(
  gamePks: number[],
  concurrency = 6,
): Promise<SavantGamePitchRow[]> {
  const out: SavantGamePitchRow[] = [];
  for (let i = 0; i < gamePks.length; i += concurrency) {
    const batch = gamePks.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((pk) => loadGamePitches(pk)));
    for (const r of results) out.push(...r);
  }
  return out;
}
