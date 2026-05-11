import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

// Daily eviction pass to keep pitch_game_pitches lean. We hot-cache
// current + previous season; older data is lazily re-fetched from
// Savant on demand via ensurePitcherSeasonCache when a user
// navigates to that season's pitcher page.
//
// Vercel schedule: late in the daily chain (after rankings refresh)
// so we never delete data that today's analytics depend on.
//
// Configurable retention via env: PITCH_DATA_KEEP_YEARS sets how
// many seasons of recent history we keep (default 1 = current + 1
// prior). Set to 2 to keep 3 most-recent seasons.

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const currentYear = new Date().getFullYear();
  const keepYears = Number(process.env.PITCH_DATA_KEEP_YEARS ?? "1");
  // p_keep_through is "season < this gets deleted", so to keep N
  // years of recent history we need to delete anything older than
  // currentYear - N.
  const keepThrough = currentYear - Math.max(0, keepYears);

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("pitch_evict_old_seasons", {
    p_keep_through: keepThrough,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    currentYear,
    keepYears,
    keepThrough,
    result: data?.[0] ?? null,
  });
}
