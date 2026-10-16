import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Season resolution.
//
// For eight months of the year "the current MLB season" and "the
// current calendar year" are the same number, so the codebase used
// `new Date().getFullYear()` interchangeably for both. They diverge
// every January, and the consequences are not cosmetic:
//
//   - The eviction cron deletes `season < currentYear`. On Jan 1 that
//     became "delete everything", with nothing to refill it until
//     spring training — and the retention guard in backfill.ts would
//     then refuse to re-fetch the season it had just dropped.
//   - The sitemap lists pitchers with `last_active_year >= season`.
//     MLB's roster endpoint returns zero players for a season that
//     hasn't started (verified: rosterType=fullSeason&season=2027 is
//     empty), so nothing would set last_active_year to the new year
//     and the sitemap would collapse to its static entries.
//   - Every season-scoped page and API would query a season with no
//     rows and render an empty state.
//
// So this module draws the distinction explicitly. Prefer
// `resolveDataSeason` wherever a Supabase client is available; it is
// grounded in what we actually hold. `fallbackDisplaySeason` is a pure
// date heuristic for the places that cannot await a query.

/**
 * Game types that count as competitive MLB baseball: regular season
 * plus the four postseason rounds (wild card, division series, league
 * championship, World Series).
 *
 * Spring training ("S"), exhibition ("E") and all-star ("A") are
 * deliberately excluded — they're not comparable for leaderboards and
 * spring training alone would roughly double ingest volume.
 *
 * Omitting the postseason codes here is what left all 46 of the 2026
 * playoff games with zero cached pitches, which in turn starved Pitch
 * of the Day from the moment the regular season ended.
 */
export const COMPETITIVE_GAME_TYPES = ["R", "F", "D", "L", "W"] as const;

/**
 * Month/day (1-indexed month) at which a new season becomes the
 * default for display purposes.
 *
 * April 1 rather than the actual opening day: by April the regular
 * season has played several days and has Statcast data, whereas a
 * late-March cutoff can point at a season whose first games haven't
 * been published yet. Spring training is not ingested, so there is no
 * data between January and late March regardless.
 */
export const DISPLAY_SEASON_ROLLOVER = { month: 4, day: 1 } as const;

/**
 * Pure date heuristic for "which season should the UI default to".
 *
 * Before April 1 this returns the PREVIOUS calendar year, because the
 * new season has no data yet. Use this only where a Supabase query
 * isn't available (client components, module-scope constants);
 * `resolveDataSeason` is authoritative.
 */
export function fallbackDisplaySeason(now: Date = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const beforeRollover =
    month < DISPLAY_SEASON_ROLLOVER.month ||
    (month === DISPLAY_SEASON_ROLLOVER.month &&
      day < DISPLAY_SEASON_ROLLOVER.day);
  return beforeRollover ? year - 1 : year;
}

/**
 * The most recent season we hold computed pitch data for.
 *
 * Reads max(season) from pitch_pitcher_aggregates — a 10 MB derived
 * table, so this is an index-friendly lookup rather than a scan of
 * pitch_game_pitches. Returns null when the table is empty or the
 * query fails, which callers must handle explicitly: for anything
 * destructive, null means "do nothing", never "assume this year".
 */
export async function resolveDataSeason(
  supabase: SupabaseClient<Database>,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("pitch_pitcher_aggregates")
    .select("season")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.season;
}

// Per-instance memo for the hot path. The data season changes at most
// once a year, so a long TTL is safe; the point is to let code called
// once per pitch-row batch ask "is this season retained?" without a
// query each time. Serverless instances are short-lived, so this needs
// no invalidation beyond the TTL.
const DATA_SEASON_TTL_MS = 60 * 60 * 1000;
let dataSeasonMemo: { season: number | null; at: number } | null = null;

/** {@link resolveDataSeason}, memoized per instance for ~1 hour. */
export async function resolveDataSeasonCached(
  supabase: SupabaseClient<Database>,
  now: number = Date.now(),
): Promise<number | null> {
  if (dataSeasonMemo && now - dataSeasonMemo.at < DATA_SEASON_TTL_MS) {
    return dataSeasonMemo.season;
  }
  const season = await resolveDataSeason(supabase);
  dataSeasonMemo = { season, at: now };
  return season;
}

/** Test seam — drops the memo so cases don't leak into each other. */
export function __resetDataSeasonMemo(): void {
  dataSeasonMemo = null;
}

/**
 * The season the UI should show, preferring real data over the
 * calendar. Falls back to the date heuristic when we hold no data at
 * all, so a brand-new or fully-evicted database still renders.
 */
export async function resolveDisplaySeason(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<number> {
  // Once the new season starts producing data this picks it up on its
  // own, because the aggregates table gains that season's rows.
  return (await resolveDataSeason(supabase)) ?? fallbackDisplaySeason(now);
}
