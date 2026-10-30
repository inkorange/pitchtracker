import { type VercelConfig } from "@vercel/config/v1";

// Vercel project config — declares the cron schedule that drives our
// data refresh pipeline. Each route under /api/cron/* is gated by
// CRON_SECRET (see src/lib/cron/auth.ts); Vercel attaches the secret
// as a Bearer header automatically when invoking the schedules below.
//
// Schedule cadence is daily, 11:00-13:00 UTC (7-9am ET) for schedule /
// roster / pitcher / team / batter metadata, then 15:30 UTC for the
// daily pick. All times are UTC.
//
// WHAT IS NO LONGER SCHEDULED, AND WHY (2026-10-27)
//
// Four jobs used to run in a second window at 15:00-16:00 UTC, all of
// them reading or writing pitch_game_pitches. Between them they were
// ~720 MB/day of disk IO on a site that gets a few hits a week:
//
//   precache-recent-games  wrote pitch_game_pitches / pitch_pitcher_games
//   refresh-aggregates     scanned it to rebuild pitch_pitcher_aggregates
//   refresh-rankings       scanned it for whiff% / csw% / K / VAA
//   evict-old-seasons      deleted from it to keep storage bounded
//
// Nothing in the application reads pitch_game_pitches any more — the
// pitcher pages, at-bat replays, leaderboards, daily-picks cron and AI
// route all read Savant on demand (lib/cache/savant-season.ts,
// lib/cache/savant-game.ts, lib/leaderboards/external.ts). That left
// these four as the table's only remaining traffic: a writer, two
// scanners of what it wrote, and a deleter.
//
// Unscheduling them is safe *right now* specifically because it is the
// offseason. No new Statcast arrives until spring training, so the
// 2026 rows these jobs consumed are frozen: re-running the scanners
// would delete and reinsert byte-identical output every night, and the
// writer has nothing to write. With no writer, nothing accumulates, so
// there is also nothing for the deleter to bound.
//
// The routes are intentionally LEFT IN PLACE and remain callable by
// hand (?season=YYYY on aggregates and rankings), so this is a
// schedule change, not a capability change:
//
//   /api/cron/refresh-aggregates   unscheduled 2026-10-27
//   /api/cron/refresh-rankings     unscheduled 2026-10-27
//   /api/cron/evict-old-seasons    unscheduled 2026-10-27
//
// precache-recent-games is gone entirely rather than unscheduled: it
// was the last caller of lib/cache/backfill.ts, whose stub-write path
// is known to clobber venue/status rows outside its 30-day window. Keeping
// a buggy writer around to look live is worse than `git revert`.
//
// SPRING 2027 DECISION — do not just re-enable these.
//
// Three ranking categories (whiff_pct, csw_pct, vaa_flat_ff) use our
// own per-pitch definitions and cannot be sourced from Savant's
// pre-aggregated endpoints: Savant's whiff% is a different metric
// (23.0 vs our 9.4 for the same pitcher) and its
// vertical_approach_angle column comes back empty (0/327 rows).
// Deriving them league-wide needs raw pitch data, and Savant's
// statcast_search caps a response at ~25,000 rows — which, at ~3,900
// pitches/day, is reached inside SIX days. So a season-wide derivation
// means ~180 chunked daily fetches, not one query. When pitches start
// arriving again, that tradeoff has to be settled before any of this
// goes back on a schedule.
//
// Pro plan supports unlimited crons; if we ever migrate to Hobby, the
// cleanest consolidation is a single /api/cron/daily route that calls
// these in sequence.
export const config: VercelConfig = {
  crons: [
    // Schedule + game status for last 30 / next 7 days. Also the
    // source of truth for the season rollover logic.
    { path: "/api/cron/refresh-games", schedule: "0 11 * * *" },

    // Per-team pitcher rosters for the active season — picks up
    // call-ups, trades, IL moves announced overnight.
    { path: "/api/cron/refresh-rosters", schedule: "0 12 * * *" },

    // Per-pitcher metadata (handedness, debut year, full name).
    // Less volatile than rosters but still worth a daily sync.
    { path: "/api/cron/refresh-pitchers", schedule: "30 12 * * *" },

    // Per-batter metadata for the AI chat resolver. Same shape as
    // refresh-pitchers — walks team rosters for position players.
    { path: "/api/cron/refresh-batters", schedule: "45 12 * * *" },

    // 30 MLB teams. Essentially static; daily keeps it self-healing
    // without measurable cost.
    { path: "/api/cron/refresh-teams", schedule: "0 13 * * *" },

    // Score recent at-bats, pick Pitch of the Day + Whiff of the Week.
    // Reads pitches from Savant on demand (~15 cached requests for a
    // day of MLB) and writes only pitch_notable_at_bats and
    // pitch_daily_features, both of which are small. Kept at 15:30 UTC
    // so Savant has published yesterday's late West Coast games.
    { path: "/api/cron/refresh-notable-at-bats", schedule: "30 15 * * *" },

    // Retry pass for the daily pick. On 2026-08-28 the 15:30 run hit
    // its 60s function limit mid-scan and never wrote a Pitch of the
    // Day; the homepage silently kept serving the previous day's row
    // for a full 24h. The route is idempotent — pitch_daily_features is
    // keyed by (feature_kind, game_date), so a second run either fills
    // the gap or upserts the identical row.
    { path: "/api/cron/refresh-notable-at-bats", schedule: "30 19 * * *" },
  ],
};
