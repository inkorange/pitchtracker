import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDisplaySeason } from "@/lib/season/current-season";

export const maxDuration = 120;

// UNSCHEDULED 2026-10-27 — this route no longer runs on a cron; see
// the comment block in vercel.ts. It is kept as a manual tool and is
// still correct if invoked by hand. Nothing writes pitch_game_pitches
// any more, so its inputs are frozen and a run reproduces identical
// output. Do not put it back on a schedule without reading the
// "SPRING 2027 DECISION" note in vercel.ts.
//
// Recomputes the homepage rankings (top 5 per category) for the
// active season. The aggregation work happens in the
// pitch_recompute_rankings(p_season int) Postgres function — keeps
// this route a thin pass-through and ensures the rebuild runs in a
// single transaction.
//
// Ordering still matters when invoked by hand: run refresh-aggregates
// FIRST so pitch_pitcher_aggregates is up-to-date for the velo / spin
// categories that read from it.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const supabase = createAdminClient();
  // Recompute for the season we actually hold data for. On the
  // calendar year this would spend every offseason day computing
  // rankings for a season with no pitches, while the rankings for the
  // season just finished went stale and the homepage strip — which
  // reads the same season — found nothing.
  const season =
    Number(url.searchParams.get("season")) ||
    (await resolveDisplaySeason(supabase));
  const { error } = await supabase.rpc("pitch_recompute_rankings", {
    p_season: season,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The leaderboard materialized views used to be refreshed here. They
  // are no longer read by anything: /velocity_leaders,
  // /strikeout_leaders and the homepage FeaturedStrip now derive their
  // boards from MLB's leaders endpoint and a cached Savant query (see
  // lib/leaderboards/external.ts), so refreshing them was two full
  // sequential scans of a 305 MB heap every night for data nobody read.
  //
  // pitch_top_velocity_7d, pitch_top_strikeouts_current and their
  // reader RPCs are now unreferenced and can be dropped; left in place
  // for one release so this is trivially revertible.

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
  });
}
