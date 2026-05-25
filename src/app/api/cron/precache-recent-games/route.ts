import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureGameCache } from "@/lib/cache/backfill";

export const maxDuration = 300;

// Game-centric daily precache. Walks the regular-season games from
// the last N days (BOUNDED to today — pitch_games stores the full
// MLB schedule including future scheduled games, so without an upper
// bound the cron iterates the rest of the season's slate uselessly)
// and ensures each game's pitches are cached in pitch_game_pitches.
// Replaces the per-pitcher precache that 504'd at 600s — there are
// ~15 MLB games per day vs ~1500 active pitchers, so doing this
// per-game is roughly 100x cheaper and scales with game volume
// rather than roster size.
//
// Games from today and yesterday are force-refetched in case the
// prior fetch was mid-game and missed late innings. Older games
// are lazy-skipped if already cached.
//
// LOOKBACK_DAYS is generous (30 days) so transient cron failures or
// post-deploy backfills self-heal across a window instead of leaving
// permanent gaps. The lazy short-circuit on ensureGameCache keeps
// the steady-state cost tiny — only games that are still missing
// pitches actually call Savant.
//
// Vercel cron schedule: 5 11 * * * (just after refresh-games, so
// the games table is current when we walk it). Must finish before
// refresh-aggregates at 11:15 so today's pitch data is in the
// table when aggregates recompute.

const LOOKBACK_DAYS = 30;
const FORCE_RECENT_DAYS = 2;
const CONCURRENCY = 8;

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = dateNDaysAgo(LOOKBACK_DAYS);
  const forceCutoff = dateNDaysAgo(FORCE_RECENT_DAYS);

  // Upper-bound on game_date is critical: pitch_games carries the
  // FULL season schedule (refreshed daily by refresh-games), so
  // without it we'd iterate the rest of the season's unplayed games
  // and waste time on empty Savant responses.
  const { data: games, error } = await supabase
    .from("pitch_games")
    .select("game_pk, game_date")
    .eq("game_type", "R")
    .gte("game_date", cutoff)
    .lte("game_date", today)
    .order("game_date", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = games ?? [];
  if (list.length === 0) {
    return NextResponse.json({ window_start: cutoff, processed: 0 });
  }

  let processed = 0;
  let failures = 0;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (g) => {
        try {
          // Force re-pull for the most recent days — a game fetched
          // mid-innings has a partial pitch set. Older games are
          // immutable, so the lazy short-circuit saves the Savant call.
          const force = g.game_date >= forceCutoff;
          await ensureGameCache(g.game_pk, { force });
        } catch {
          failures += 1;
        }
      }),
    );
    processed += batch.length;
  }

  return NextResponse.json({
    window_start: cutoff,
    force_cutoff: forceCutoff,
    games_seen: list.length,
    processed,
    failures,
  });
}
