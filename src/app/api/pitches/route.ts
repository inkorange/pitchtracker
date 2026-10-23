import { NextResponse } from "next/server";
import { botIdGuard } from "@/lib/botid-guard";
import { loadGamePitches } from "@/lib/cache/savant-game";

export const maxDuration = 60;


// Returns one game's pitches, optionally narrowed to a single pitcher.
//
// Reads from Savant through the cached per-game read-through and writes
// nothing. This was previously a read-through-AND-WRITE against
// pitch_game_pitches, with a `fetched_at` staleness check to allow for
// Statcast corrections; the cache TTL in lib/cache/savant-game.ts now
// serves that purpose.
export async function GET(request: Request) {
  const botBlock = await botIdGuard();
  if (botBlock) return botBlock;

  const url = new URL(request.url);
  const gamePkParam = url.searchParams.get("gamePk");
  const pitcherIdParam = url.searchParams.get("pitcherId");

  if (!gamePkParam) {
    return NextResponse.json({ error: "gamePk required" }, { status: 400 });
  }
  const gamePk = Number(gamePkParam);
  const pitcherId = pitcherIdParam ? Number(pitcherIdParam) : null;

  // Cached per-game Savant read. This route used to be a
  // read-through-and-WRITE: it selected the game's rows, and on a miss
  // or a stale `fetched_at` it fetched from Savant and upserted every
  // column back. That write path was part of the 48% of database WAL
  // the pitch upsert accounted for, and it existed only to populate a
  // table nothing reads any more.
  const all = await loadGamePitches(gamePk);
  const pitches =
    pitcherId !== null
      ? all.filter((p) => p.pitcher_id === pitcherId)
      : all;

  return NextResponse.json({ pitches }, { headers: { "cache-control": "public, max-age=300" } });
}
