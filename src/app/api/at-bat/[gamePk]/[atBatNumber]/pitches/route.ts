import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureGameCache } from "@/lib/cache/backfill";

// Returns every pitch in a single at-bat, ordered by pitch_number,
// shaped to match the ReplayPitch type the at-bat replay machinery
// already consumes. Drives the inline at-bat playback on the
// pitcher page once the user picks a matchup.
//
//   GET /api/at-bat/[gamePk]/[atBatNumber]/pitches
// Returns: { pitches: ReplayPitch[] }
//
// We don't strictly need a separate endpoint from the existing
// /api/pitches (which takes a gamePk), but a focused at-bat fetch
// returns ~5 rows instead of ~250 per game and keeps the inline
// playback responsive.

interface RouteParams {
  params: Promise<{ gamePk: string; atBatNumber: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { gamePk, atBatNumber } = await params;
  const gamePkN = Number(gamePk);
  const atBatN = Number(atBatNumber);
  if (!Number.isFinite(gamePkN) || !Number.isFinite(atBatN)) {
    return NextResponse.json({ error: "Invalid gamePk or atBatNumber" }, { status: 400 });
  }

  const supabase = await createClient();
  // Lazy backfill: same pattern the at-bat replay page uses.
  await ensureGameCache(gamePkN);

  const { data, error } = await supabase
    .from("pitch_game_pitches")
    .select(
      "game_pk, at_bat_number, pitch_number, pitcher_id, batter_id, pitch_type, pitch_name, description, events, balls, strikes, outs_when_up, inning, inning_topbot, stand, p_throws, on_1b, on_2b, on_3b, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension",
    )
    .eq("game_pk", gamePkN)
    .eq("at_bat_number", atBatN)
    .order("pitch_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    { pitches: data ?? [] },
    { headers: { "cache-control": "public, max-age=120" } },
  );
}
