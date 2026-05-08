import { type VercelConfig } from "@vercel/config/v1";

// Vercel project config — declares the cron schedule that drives our
// data refresh pipeline. Each route under /api/cron/* is gated by
// CRON_SECRET (see src/lib/cron/auth.ts); Vercel attaches the secret
// as a Bearer header automatically when invoking the schedules below.
//
// Schedule cadence is daily. Schedules are staggered by 15-30 min so
// downstream jobs (aggregates, notable-at-bats) see fresh data from
// upstream jobs (games). All times are UTC; 11:00 UTC = 7am ET, late
// enough for overnight Savant/MLB Stats data to settle.
//
// Pro plan supports unlimited crons; if we ever migrate to Hobby, the
// cleanest consolidation is a single /api/cron/daily route that calls
// these in sequence.
export const config: VercelConfig = {
  crons: [
    // Schedule + game status for last 30 / next 7 days. Runs first so
    // downstream aggregate + notable-at-bats jobs see today's results.
    { path: "/api/cron/refresh-games", schedule: "0 11 * * *" },

    // Walk every active pitcher and lazy-fetch their season pitches
    // from Savant so the rankings + aggregates see the full league,
    // not just pitchers whose pages have been visited.
    // ensurePitcherSeasonCache short-circuits when data is already
    // cached — re-runs are cheap.
    { path: "/api/cron/precache-season-pitchers", schedule: "5 11 * * *" },

    // Recompute pitch_pitcher_aggregates from cached pitches. Reads
    // pitch_game_pitches, writes pitch_pitcher_aggregates.
    { path: "/api/cron/refresh-aggregates", schedule: "15 11 * * *" },

    // Score recent at-bats, pick Pitch of the Day + Whiff of the Week.
    // Reads cached pitches; writes pitch_notable_at_bats and
    // pitch_daily_features. Depends on aggregates being up-to-date.
    { path: "/api/cron/refresh-notable-at-bats", schedule: "30 11 * * *" },

    // Top-5-per-category leaderboards for the homepage Rankings
    // strip. Reads pitch_pitcher_aggregates (velo / spin) and raw
    // pitch_game_pitches (whiff%, csw%, K, VAA). Depends on
    // refresh-aggregates having finished.
    { path: "/api/cron/refresh-rankings", schedule: "45 11 * * *" },

    // Per-team pitcher rosters for the active season — picks up
    // call-ups, trades, IL moves announced overnight.
    { path: "/api/cron/refresh-rosters", schedule: "0 12 * * *" },

    // Per-pitcher metadata (handedness, debut year, full name).
    // Less volatile than rosters but still worth a daily sync.
    { path: "/api/cron/refresh-pitchers", schedule: "30 12 * * *" },

    // 30 MLB teams. Essentially static; daily keeps it self-healing
    // without measurable cost.
    { path: "/api/cron/refresh-teams", schedule: "0 13 * * *" },
  ],
};
