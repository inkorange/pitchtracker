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
 * Extra seasons of history kept on top of the newest season with data.
 * 0 (the default) means "newest season only".
 */
export const RETENTION_KEEP_YEARS = Number(
  process.env.PITCH_DATA_KEEP_YEARS ?? "0",
);

/**
 * Whether we keep cached pitch rows for a season.
 *
 * One definition, three consumers that must agree:
 *   - the write guard in lib/cache/backfill.ts (what we persist)
 *   - /api/cron/evict-old-seasons (what gets deleted)
 *   - the archive read-through (which seasons are served live from
 *     Savant instead of Postgres)
 *
 * Resolution failure returns true — the permissive answer. A stray
 * write is cheap and the cron trims it; wrongly declaring a season
 * unretained would route the current season through the archive path.
 */
export async function isRetainedSeason(
  supabase: SupabaseClient<Database>,
  season: number,
): Promise<boolean> {
  const dataSeason = await resolveDataSeasonCached(supabase);
  if (dataSeason === null) return true;
  return season >= dataSeason - Math.max(0, RETENTION_KEEP_YEARS);
}

/**
 * How far ahead to look for a scheduled game before calling it the
 * offseason. MLB plays near-daily, so 10 days comfortably spans the
 * All-Star break and any off-day stretch without false positives.
 */
const OFFSEASON_LOOKAHEAD_DAYS = 10;

/**
 * Whether there is baseball coming up.
 *
 * Defined as "no game on the schedule in the next
 * OFFSEASON_LOOKAHEAD_DAYS", which is both cheap (pitch_games is a few
 * thousand rows and indexed on game_date) and self-maintaining:
 * refresh-games only loads the last 30 / next 7 days, so once the
 * postseason ends the table simply has no future rows until the next
 * season's schedule starts landing.
 *
 * Used to tell "the window is empty because the season is over" apart
 * from "the window is empty because something is broken" — a
 * distinction the UI could not previously make, so both rendered the
 * same blank panel.
 */
export async function isOffseason(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<boolean> {
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(
    now.getTime() + OFFSEASON_LOOKAHEAD_DAYS * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  const { data, error } = await supabase
    .from("pitch_games")
    .select("game_pk")
    .gte("game_date", today)
    .lte("game_date", horizon)
    .limit(1);
  // On error, claim in-season: a transient query failure should not
  // relabel the whole site as offseason.
  if (error) return false;
  return (data ?? []).length === 0;
}

/**
 * Whether the regular season has stopped producing games, while
 * baseball is still being played.
 *
 * The leaderboards are deliberately regular-season-only (postseason
 * innings are unevenly distributed and played against stronger
 * lineups, so blending them would make the comparison meaningless).
 * The consequence is that a rolling-window board like
 * pitch_top_velocity_7d is legitimately empty for the three weeks of
 * October between the last regular-season game and the last out of the
 * World Series — with nothing to distinguish that from a fault.
 *
 * True when no regular-season game has been played in `days`, which
 * covers both the postseason and the offseason; pair it with
 * {@link isOffseason} to tell those two apart.
 */
export async function isRegularSeasonOver(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
  days = 7,
): Promise<boolean> {
  const since = new Date(now.getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await supabase
    .from("pitch_games")
    .select("game_pk")
    .eq("game_type", "R")
    .gte("game_date", since)
    .lte("game_date", now.toISOString().slice(0, 10))
    .limit(1);
  // On error, claim the season is live so we don't mislabel a blank
  // board as "season complete" because of a transient failure.
  if (error) return false;
  return (data ?? []).length === 0;
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
