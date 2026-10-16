import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDataSeason } from "@/lib/season/current-season";

export const maxDuration = 120;

// Daily eviction pass to keep pitch_game_pitches lean. We hot-cache
// ONLY the current season by default; older data is lazily re-fetched
// from Savant on demand via ensurePitcherSeasonCache when a user
// navigates to that season's pitcher page.
//
// Vercel schedule: late in the daily chain (after rankings refresh)
// so we never delete data that today's analytics depend on.
//
// Configurable retention via env: PITCH_DATA_KEEP_YEARS sets how
// many EXTRA seasons of history we keep (default 0 = newest season
// with data only). Set to 1 to also keep the previous season, 2 for
// two priors. Tightened from the old default of 1 because
// pitch_game_pitches was approaching the DB storage quota (500MB+ at
// 2-season retention).
//
// "Newest season with data", not "current calendar year" — see the
// comment on dataSeason below for why that distinction is load-bearing.

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const keepYears = Number(process.env.PITCH_DATA_KEEP_YEARS ?? "0");
  const supabase = createAdminClient();

  // Retention is anchored to the newest season we actually hold data
  // for, NOT to the calendar year.
  //
  // This was `new Date().getFullYear()`, which made the cliff below
  // inevitable: at 16:00 UTC on Jan 1 the keep-through would advance
  // to the new year while the newest data was still the season just
  // finished, so the very first run of the year deleted every pitch,
  // pitcher-game and aggregate row we had. Nothing would refill it
  // either — spring training is months away and isn't ingested, and
  // the retention guard in backfill.ts would by then consider the
  // dropped season out of window and refuse to re-fetch it.
  //
  // Anchoring to the data season means the window only advances once
  // the new season is actually producing rows, which is the behaviour
  // the keepYears knob always assumed.
  const dataSeason = await resolveDataSeason(supabase);

  // Fail safe. This endpoint only deletes, so "we could not establish
  // what the newest season is" must mean "delete nothing" — never
  // "fall back to the calendar", which is the assumption that caused
  // the problem in the first place.
  if (dataSeason === null) {
    return NextResponse.json({
      skipped: true,
      reason:
        "Could not resolve the newest season with data; skipping eviction rather than risking a bad delete.",
      keepYears,
    });
  }

  // p_keep_through is "season < this gets deleted", so to keep N
  // seasons of history we delete anything older than dataSeason - N.
  const keepThrough = dataSeason - Math.max(0, keepYears);

  const { data, error } = await supabase.rpc("pitch_evict_old_seasons", {
    p_keep_through: keepThrough,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    dataSeason,
    calendarYear: new Date().getFullYear(),
    keepYears,
    keepThrough,
    result: data?.[0] ?? null,
  });
}
