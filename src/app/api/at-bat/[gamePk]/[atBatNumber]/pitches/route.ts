import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureGameCache } from "@/lib/cache/backfill";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";

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
//
// This endpoint is JSON — it has ZERO SEO value. All bot-defense
// levers below are safe to enable without hurting crawler-driven
// discoverability of the parent HTML page (/at-bat/[gamePk]/[atBatNumber]/[slug]):
//   1) X-Robots-Tag: noindex, nofollow on the response — some bots
//      that ignore robots.txt still honor this header.
//   2) Per-IP rate limit — a real user visiting the page fires this
//      exactly once per navigation; anything hitting it > 30x/min
//      or > 500x/day is definitely bot traffic.
//   3) cache-control s-maxage bumped 120s → 3600s. A single at-bat's
//      pitch data is immutable once the game ends, so a longer edge
//      cache is safe and absorbs bot enumeration cheaply.

interface RouteParams {
  params: Promise<{ gamePk: string; atBatNumber: string }>;
}

const RATE_LIMIT = { perMinute: 30, perDay: 500 };

const NOINDEX_HEADERS = {
  "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
  "x-robots-tag": "noindex, nofollow",
} as const;

export async function GET(request: Request, { params }: RouteParams) {
  const { gamePk, atBatNumber } = await params;
  const gamePkN = Number(gamePk);
  const atBatN = Number(atBatNumber);
  if (!Number.isFinite(gamePkN) || !Number.isFinite(atBatN)) {
    return NextResponse.json(
      { error: "Invalid gamePk or atBatNumber" },
      { status: 400, headers: NOINDEX_HEADERS },
    );
  }

  const ip = clientIpFromRequest(request);
  const rl = checkRateLimit("at-bat-pitches", ip, RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", reason: rl.reason },
      {
        status: 429,
        headers: {
          ...NOINDEX_HEADERS,
          "retry-after": String(rl.retryAfterSeconds ?? 60),
        },
      },
    );
  }

  const supabase = await createClient();
  // Lazy backfill: same pattern the at-bat replay page uses. The
  // 30-day age guard in ensureGameCache means old-game enumeration
  // by bots no longer triggers Savant fetches — the guard short-
  // circuits before the CSV download.
  await ensureGameCache(gamePkN);

  const { data, error } = await supabase
    .from("pitch_game_pitches")
    .select(
      "game_pk, at_bat_number, pitch_number, pitcher_id, batter_id, pitch_type, description, events, balls, strikes, outs_when_up, inning, inning_topbot, stand, on_1b, on_2b, on_3b, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension",
    )
    .eq("game_pk", gamePkN)
    .eq("at_bat_number", atBatN)
    .order("pitch_number", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NOINDEX_HEADERS },
    );
  }
  return NextResponse.json(
    { pitches: data ?? [] },
    { headers: NOINDEX_HEADERS },
  );
}
