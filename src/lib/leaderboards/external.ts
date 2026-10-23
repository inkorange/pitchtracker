import { unstable_cache } from "next/cache";
import {
  fetchLeagueWindowPitches,
  type SavantPitchRow,
} from "@/lib/savant/client";

// Leaderboards derived from external APIs instead of our own pitch table.
//
// Why: pitch_game_pitches is a 305 MB heap, and the two leaderboard
// materialized views over it were the single largest remaining source
// of disk IO — two full sequential scans per night, every night,
// whether or not anyone looked at a leaderboard. For a site with little
// traffic that is almost entirely wasted work.
//
// Both boards can come from upstream instead, at a tiny fraction of the
// cost:
//
//   strikeouts -> MLB Stats API's leaders endpoint. A 2 KB response,
//                 already ranked. Verified to agree exactly with what
//                 our materialized view computed (252 for Misiorowski).
//
//   velocity   -> one Savant query for the league's fastballs over the
//                 window, aggregated here. ~9 MB for a measured 7-day
//                 window (12,977 rows, 429 pitchers), which the Next
//                 data cache absorbs — only the small aggregated result
//                 is cached, not the CSV.
//
// Pitcher names and teams still come from pitch_pitchers / pitch_teams,
// which are 10 MB and 2 MB respectively and stay in Postgres.

const STATSAPI = "https://statsapi.mlb.com/api/v1";

// Completed days don't change, and a leaderboard is not time-critical.
// Matches the 6h used by the other Savant read-throughs.
const LEADERBOARD_REVALIDATE_S = 60 * 60 * 6;

const UA = "pitchtracker/0.1 (+https://github.com/inkorange/pitchtracker)";

/** Shape returned by the pitch_top_velocity RPC this replaces. */
export interface VelocityLeader {
  rank: number;
  pitcher_id: number;
  avg_velo: number;
  fb_pitches: number;
}

/** Shape returned by the pitch_top_strikeouts RPC this replaces. */
export interface StrikeoutLeader {
  rank: number;
  pitcher_id: number;
  strikeouts: number;
}

/**
 * Aggregate raw pitches into a velocity leaderboard.
 *
 * Pure, so the ranking rules are testable without network access.
 * Mirrors the materialized view it replaces: mean release speed per
 * pitcher over the window, pitchers below `minPitches` dropped, highest
 * average first.
 */
export function aggregateVelocityLeaders(
  rows: SavantPitchRow[],
  opts: { limit: number; minPitches: number },
): VelocityLeader[] {
  const byPitcher = new Map<number, { sum: number; n: number }>();
  for (const r of rows) {
    const id = r.pitcher;
    const speed = r.release_speed;
    if (typeof id !== "number" || !Number.isFinite(id)) continue;
    if (typeof speed !== "number" || !Number.isFinite(speed)) continue;
    const e = byPitcher.get(id) ?? { sum: 0, n: 0 };
    e.sum += speed;
    e.n += 1;
    byPitcher.set(id, e);
  }

  const ranked = Array.from(byPitcher.entries())
    .filter(([, e]) => e.n >= opts.minPitches)
    .map(([pitcher_id, e]) => ({
      pitcher_id,
      // Round to a tenth, matching the view's round(avg(...), 1) so the
      // displayed numbers don't shift when the source changes.
      avg_velo: Math.round((e.sum / e.n) * 10) / 10,
      fb_pitches: e.n,
    }))
    // Ties broken by pitch count, then id, so the order is stable
    // across requests rather than depending on Map iteration.
    .sort(
      (a, b) =>
        b.avg_velo - a.avg_velo ||
        b.fb_pitches - a.fb_pitches ||
        a.pitcher_id - b.pitcher_id,
    )
    .slice(0, opts.limit);

  return ranked.map((r, i) => ({ rank: i + 1, ...r }));
}

/**
 * Inclusive date bounds for a trailing window of `days` calendar days.
 *
 * Savant's game_date_gt / game_date_lt are INCLUSIVE on both ends
 * despite the names — verified with a single-day window (gt = lt =
 * 2026-08-03 returns 716 rows, all from that date). So a `days`-long
 * window ending today starts at today-(days-1), not today-days.
 *
 * Using the latter produced an 8-day window where the materialized view
 * this replaces used `game_date > current_date - 7`. Caught by running
 * both sources over the same week: with the off-by-one, Savant reported
 * 41 fastballs for the leader against the view's 32; corrected, all ten
 * rows matched exactly on pitcher, average and count.
 */
function velocityWindow(
  days: number,
  now: Date = new Date(),
): { dateFrom: string; dateTo: string } {
  const dateTo = now.toISOString().slice(0, 10);
  const dateFrom = new Date(
    now.getTime() - Math.max(0, days - 1) * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  return { dateFrom, dateTo };
}

const cachedVelocityLeaders = unstable_cache(
  async (
    season: number,
    dateFrom: string,
    dateTo: string,
    limit: number,
    minPitches: number,
  ): Promise<VelocityLeader[]> => {
    const rows = await fetchLeagueWindowPitches({
      season,
      // Four-seam and sinker: the "fastball" definition the previous
      // view used (pitch_type in ('FF','SI')).
      pitchTypes: ["FF", "SI"],
      dateFrom,
      dateTo,
    });
    return aggregateVelocityLeaders(rows, { limit, minPitches });
  },
  ["external-velocity-leaders"],
  { revalidate: LEADERBOARD_REVALIDATE_S, tags: ["external-leaderboards"] },
);

/**
 * Top fastball velocity over a trailing window.
 *
 * Returns an empty array when the window holds no regular-season
 * pitches, which is the honest answer during the postseason and
 * offseason; callers already distinguish those cases (see
 * isRegularSeasonOver / isOffseason).
 */
export async function fetchVelocityLeaders(opts: {
  season: number;
  days: number;
  limit: number;
  minPitches: number;
  now?: Date;
}): Promise<VelocityLeader[]> {
  const { dateFrom, dateTo } = velocityWindow(opts.days, opts.now);
  try {
    return await cachedVelocityLeaders(
      opts.season,
      dateFrom,
      dateTo,
      opts.limit,
      opts.minPitches,
    );
  } catch (err) {
    console.error("[leaderboards] velocity fetch failed:", err);
    return [];
  }
}

interface StatsApiLeadersResponse {
  leagueLeaders?: Array<{
    leaderCategory?: string;
    leaders?: Array<{
      rank?: number;
      value?: string | number;
      person?: { id?: number };
    }>;
  }>;
}

/**
 * Parse MLB's leaders payload into our row shape.
 *
 * Pure for testability. The endpoint already ranks and can repeat a
 * rank on ties, which is preserved rather than re-numbered — the pages
 * render whatever rank they're given.
 */
export function parseStrikeoutLeaders(
  body: StatsApiLeadersResponse,
  limit: number,
): StrikeoutLeader[] {
  const category = (body.leagueLeaders ?? []).find(
    (c) => c.leaderCategory === "strikeouts",
  );
  const out: StrikeoutLeader[] = [];
  for (const l of category?.leaders ?? []) {
    const id = l.person?.id;
    const value = typeof l.value === "string" ? Number(l.value) : l.value;
    if (typeof id !== "number" || typeof value !== "number") continue;
    if (!Number.isFinite(value)) continue;
    out.push({
      rank: typeof l.rank === "number" ? l.rank : out.length + 1,
      pitcher_id: id,
      strikeouts: value,
    });
    if (out.length >= limit) break;
  }
  return out;
}

const cachedStrikeoutLeaders = unstable_cache(
  async (season: number, limit: number): Promise<StrikeoutLeader[]> => {
    const url =
      `${STATSAPI}/stats/leaders?leaderCategories=strikeouts` +
      `&season=${season}&statGroup=pitching&sportId=1&limit=${limit}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`MLB Stats API ${res.status} ${res.statusText}`);
    }
    return parseStrikeoutLeaders(
      (await res.json()) as StatsApiLeadersResponse,
      limit,
    );
  },
  ["external-strikeout-leaders"],
  { revalidate: LEADERBOARD_REVALIDATE_S, tags: ["external-leaderboards"] },
);

/** Season strikeout leaders, straight from MLB. */
export async function fetchStrikeoutLeaders(opts: {
  season: number;
  limit: number;
}): Promise<StrikeoutLeader[]> {
  try {
    return await cachedStrikeoutLeaders(opts.season, opts.limit);
  } catch (err) {
    console.error("[leaderboards] strikeout fetch failed:", err);
    return [];
  }
}

/** Exported for tests — the window math is pure. */
export const __testables = { velocityWindow };
