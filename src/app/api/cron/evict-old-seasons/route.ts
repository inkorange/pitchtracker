import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDataSeason } from "@/lib/season/current-season";

export const maxDuration = 120;

// UNSCHEDULED 2026-10-27 — this route no longer runs on a cron; see
// the comment block in vercel.ts. It is kept as a manual tool and is
// still correct if invoked by hand. Nothing writes pitch_game_pitches
// any more, so its inputs are frozen and a run reproduces identical
// output. Do not put it back on a schedule without reading the
// "SPRING 2027 DECISION" note in vercel.ts.
//
// Eviction pass to keep pitch_game_pitches lean. We hot-cache
// ONLY the newest season with data by default. (Was a daily cron
// until 2026-10-27; with no writer left, nothing accumulates for it
// to bound, so it only matters if ingestion is ever turned back on.)
//
// NOTE: this comment used to claim older seasons were "lazily
// re-fetched from Savant on demand via ensurePitcherSeasonCache when a
// user navigates to that season's pitcher page". That is NOT true and
// has not been since the retention guard landed in backfill.ts: that
// guard skips on-demand writes for any season outside the retention
// window, precisely so an old-season pageview doesn't write ~3K rows
// for this cron to delete hours later. The visible result is that
// /pitcher/{id}/{slug}?season=<old> renders "No arsenal data", even
// though Savant still serves the data. Restoring that access needs a
// read-through path that doesn't persist — tracked separately.
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
