import { type VercelConfig } from "@vercel/config/v1";

// Vercel project config — declares the cron schedule that drives our
// data refresh pipeline. Each route under /api/cron/* is gated by
// CRON_SECRET (see src/lib/cron/auth.ts); Vercel attaches the secret
// as a Bearer header automatically when invoking the schedules below.
//
// Schedule cadence is daily. Two staggered windows:
//   1) 11:00–13:00 UTC (7–9am ET) — schedule / roster / pitcher /
//      team / batter metadata. Independent of Savant pitch data.
//   2) 15:00–15:45 UTC (11–11:45am ET) — everything that reads from
//      pitch_game_pitches. Delayed on purpose: MLB games typically
//      end 03:00–05:00 UTC and Statcast/Savant takes 2–6h to publish.
//      An earlier 11:05 UTC precache-recent-games slot was racing
//      Statcast and failing to backfill yesterday's games, which in
//      turn kept the notable-at-bats cron at 11:30 UTC from picking
//      today's Pitch of the Day. Moving the pitch-dependent chain to
//      15:00 UTC gives Savant a comfortable buffer.
// All times are UTC.
//
// Pro plan supports unlimited crons; if we ever migrate to Hobby, the
// cleanest consolidation is a single /api/cron/daily route that calls
// these in sequence.
export const config: VercelConfig = {
  crons: [
    // Schedule + game status for last 30 / next 7 days. Runs first so
    // downstream aggregate + notable-at-bats jobs see today's results.
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

    // Game-centric daily precache: walks the last week of regular-
    // season games and ensures each game's pitches are cached.
    // ~15 games/day vs the prior per-pitcher approach's ~1500 calls
    // — fits well under the function timeout and keeps every active
    // pitcher's data current (since pitch rows backfill all the
    // pitchers who appeared in those games). Runs at 15:00 UTC so
    // Savant has finished processing yesterday's late games.
    { path: "/api/cron/precache-recent-games", schedule: "0 15 * * *" },

    // Recompute pitch_pitcher_aggregates from cached pitches. Reads
    // pitch_game_pitches, writes pitch_pitcher_aggregates.
    { path: "/api/cron/refresh-aggregates", schedule: "15 15 * * *" },

    // Score recent at-bats, pick Pitch of the Day + Whiff of the Week.
    // Reads cached pitches; writes pitch_notable_at_bats and
    // pitch_daily_features. Depends on aggregates being up-to-date.
    { path: "/api/cron/refresh-notable-at-bats", schedule: "30 15 * * *" },

    // Retry pass for the daily pick. On 2026-08-28 the 15:30 run hit
    // its 60s function limit mid-scan and never wrote a Pitch of the
    // Day; the homepage silently kept serving the previous day's row
    // for a full 24h. The route is idempotent — pitch_daily_features is
    // keyed by (feature_kind, game_date), so a second run either fills
    // the gap or upserts the identical row. Also covers Savant
    // publishing yesterday's late West Coast games after 15:30 UTC.
    { path: "/api/cron/refresh-notable-at-bats", schedule: "30 19 * * *" },

    // Top-5-per-category leaderboards for the homepage Rankings
    // strip. Reads pitch_pitcher_aggregates (velo / spin) and raw
    // pitch_game_pitches (whiff%, csw%, K, VAA). Depends on
    // refresh-aggregates having finished.
    { path: "/api/cron/refresh-rankings", schedule: "45 15 * * *" },

    // Evict pitch_game_pitches / pitch_pitcher_games / aggregates
    // rows for seasons older than (currentYear - PITCH_DATA_KEEP_YEARS).
    // Runs last in the chain so today's analytics jobs above operate
    // on the full set before we trim. Lazy re-fetch on demand
    // handles old-season pageviews via ensurePitcherSeasonCache.
    { path: "/api/cron/evict-old-seasons", schedule: "0 16 * * *" },
  ],
};
