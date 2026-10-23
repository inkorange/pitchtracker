import { NextResponse } from "next/server";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";
import { botIdGuard } from "@/lib/botid-guard";
import { loadAtBatPitches } from "@/lib/cache/savant-game";

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
  // Vercel BotID: blocks 401 when the request lacks the client-side
  // signal (bot hitting the JSON URL directly without loading a page).
  // Runs first so cheap requests get rejected before we touch params
  // or the DB.
  const botBlock = await botIdGuard();
  if (botBlock) return botBlock;

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

  // Cached per-game Savant read. The lazy backfill that used to run
  // here is gone with the table it populated.
  const data = await loadAtBatPitches(gamePkN, atBatN);

  return NextResponse.json(
    { pitches: data },
    { headers: NOINDEX_HEADERS },
  );
}
