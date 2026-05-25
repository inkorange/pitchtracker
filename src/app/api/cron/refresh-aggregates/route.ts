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
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  const { error } = await supabase.rpc("pitch_recompute_aggregates");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count } = await supabase
    .from("pitch_pitcher_aggregates")
    .select("pitcher_id", { count: "exact", head: true });

  return NextResponse.json({ ok: true, total_rows: count ?? null });
}
