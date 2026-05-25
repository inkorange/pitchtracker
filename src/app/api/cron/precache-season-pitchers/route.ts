import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePitcherSeasonCache } from "@/lib/cache/backfill";

export const maxDuration = 600;

// Walks every active-this-season pitcher and refreshes their cached
// season pitches. Forces a Savant pull every run (vs. the lazy
// page-load path that short-circuits on any existing cached games)
// so newly-pitched games make it into pitch_game_pitches the day
// after they're played — without `force`, the rankings freeze at
// whatever each pitcher's first-fetched snapshot contained.
//
// Vercel cron schedule: must run BEFORE refresh-aggregates so the
// downstream aggregates / rankings see today's games.
//
// Cost: 1500 pitchers × ~1s/Savant fetch with concurrency=6 sits
// around 250-300s real-world. Bumped maxDuration well above that
// to absorb tail latency without aborting the run.

const CONCURRENCY = 6;

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const season =
    Number(url.searchParams.get("season")) || new Date().getFullYear();

  const supabase = createAdminClient();
  const { data: pitchers, error } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id")
    .eq("last_active_year", season);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const ids = (pitchers ?? []).map((p) => p.mlb_id);
  if (ids.length === 0) {
    return NextResponse.json({ season, processed: 0, note: "no active pitchers" });
  }

  let processed = 0;
  let failures = 0;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (id) => {
        try {
          // force=true so already-cached pitchers get refreshed —
          // otherwise their data freezes at the first cached snapshot.
          await ensurePitcherSeasonCache(id, season, { force: true });
        } catch {
          failures += 1;
        }
      }),
    );
    processed += batch.length;
  }

  return NextResponse.json({ season, processed, failures });
}
