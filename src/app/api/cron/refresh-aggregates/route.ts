import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 180;

// Recomputes pitch_pitcher_aggregates from whatever is currently cached in
// pitch_game_pitches by calling the pitch_recompute_aggregates() Postgres
// function. The function body lives in supabase/migrations.
//
// Sourcing aggregates from raw cached pitches (instead of an external Savant
// endpoint) means the table grows organically as games get loaded, and we
// don't depend on any guessed third-party URL shape.
//
// Scoped to the current season: historical seasons are frozen — once the
// daily ingestion window has rolled past them, no new pitches land in those
// rows — so rescanning them every day just pays full-table disk-IO for no
// data change. To rebuild historical aggregates (after a schema change or
// a backfill of past seasons), call with ?season=YYYY or ?all=1.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const allParam = url.searchParams.get("all") === "1";
  const seasonParam = Number(url.searchParams.get("season"));
  const currentSeason = new Date().getUTCFullYear();
  const targetSeason: number | null = allParam
    ? null
    : Number.isFinite(seasonParam) && seasonParam > 0
      ? seasonParam
      : currentSeason;

  const supabase = createAdminClient();

  const { error } = await supabase.rpc("pitch_recompute_aggregates", {
    p_pitcher_id: null,
    p_season: targetSeason,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count } = await supabase
    .from("pitch_pitcher_aggregates")
    .select("pitcher_id", { count: "exact", head: true });

  return NextResponse.json({
    ok: true,
    season: targetSeason,
    total_rows: count ?? null,
  });
}
