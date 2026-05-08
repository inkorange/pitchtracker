import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePitcherSeasonCache } from "@/lib/cache/backfill";

export const maxDuration = 300;

// Walks every active-this-season pitcher and ensures their season
// pitches are in pitch_game_pitches. Until this runs at least once,
// the cache only contains pitchers whose /pitcher/[id] pages have
// been visited — which makes the homepage rankings biased toward
// "pitchers Chris has tested with" instead of the actual MLB top
// performers.
//
// ensurePitcherSeasonCache short-circuits as a no-op for any pitcher
// who already has games cached, so re-runs are cheap. Concurrency is
// kept low (4) to stay polite to Savant and so Vercel's 300s
// per-invocation cap covers a worst-case full backfill.
//
// Vercel cron schedule: must run BEFORE refresh-aggregates so the
// downstream aggregates / rankings see the complete pitcher set.

const CONCURRENCY = 4;

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
          await ensurePitcherSeasonCache(id, season);
        } catch {
          failures += 1;
        }
      }),
    );
    processed += batch.length;
  }

  return NextResponse.json({ season, processed, failures });
}
