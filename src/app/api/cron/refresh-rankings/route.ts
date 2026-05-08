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
  return NextResponse.json({ season, counts: byCategory });
}
