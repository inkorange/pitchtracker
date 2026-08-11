import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

// Recomputes the homepage rankings (top 5 per category) for the
// active season. The aggregation work happens in the
// pitch_recompute_rankings(p_season int) Postgres function — keeps
// this route a thin pass-through and ensures the rebuild runs in a
// single transaction.
//
// Vercel cron schedule: should be fired AFTER refresh-aggregates so
// pitch_pitcher_aggregates is up-to-date for the velo / spin
// categories that read from it.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const season =
    Number(url.searchParams.get("season")) || new Date().getFullYear();

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("pitch_recompute_rankings", {
    p_season: season,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Refresh the leaderboard materialized views (pitch_top_velocity_7d,
  // pitch_top_strikeouts_current) that back the homepage FeaturedStrip,
  // /velocity_leaders, and /strikeout_leaders. Before this hook the two
  // pitch_top_* RPCs full-scanned the 377 MB pitch_game_pitches heap on
  // every pageview — ~7,500 scans/day and the top Disk IO consumers on
  // the Supabase Portfolio project. With the MVs in place, the RPCs
  // are thin readers of a few thousand rows and the refresh below is
  // the ONLY heavy scan per day. REFRESH CONCURRENTLY takes ACCESS
  // SHARE (not EXCLUSIVE) so leaderboard reads keep serving during
  // the rebuild. Best-effort: a failure here doesn't fail the whole
  // rankings cron, since the MV keeps yesterday's snapshot until the
  // next successful refresh.
  const { error: mvErr } = await supabase.rpc("pitch_refresh_leaderboards");
  if (mvErr) {
    console.error("[refresh-rankings] leaderboard MV refresh failed:", mvErr);
  }

  // Sanity-check: count rows by category so the response is useful
  // for monitoring (each category should have 5 rows once the season
  // has enough pitches).
  const { data: counts } = await supabase
    .from("pitch_rankings")
    .select("category")
    .eq("season", season);
  const byCategory: Record<string, number> = {};
  for (const r of counts ?? []) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  }
  return NextResponse.json({
    season,
    counts: byCategory,
    leaderboards_refreshed: mvErr == null,
  });
}
