import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensurePitcherSeasonCache } from "@/lib/cache/backfill";
import { fetchPersonsCached } from "@/lib/statsapi/client";

// Typeahead for the "Find at-bats" picker on /pitcher/[id]. Scoped
// to batters this pitcher actually faced in the selected season —
// we don't need to surface the full MLB roster here, and we don't
// have a `pitch_batters` table to search anyway. The batter ID
// universe is computed server-side from pitch_game_pitches; names
// come from the MLB Stats API (cached by fetchPersonsCached).
//
//   GET /api/pitcher/[id]/batters?season=Y&q=trout
// Returns: { batters: [{ id, fullName }] }, sorted by name, capped
// at 12 results.

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const pitcherId = Number(id);
  if (!Number.isFinite(pitcherId)) {
    return NextResponse.json({ error: "Invalid pitcher id" }, { status: 400 });
  }
  const url = new URL(request.url);
  const season = Number(url.searchParams.get("season")) || new Date().getFullYear();
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) {
    return NextResponse.json({ batters: [] });
  }

  const supabase = await createClient();
  // First-visit lazy backfill so the batter universe is complete.
  await ensurePitcherSeasonCache(pitcherId, season);

  // Distinct batter ids this pitcher faced in this season. Restricted
  // to regular-season games to match the rest of the pitcher view.
  const { data: rows, error } = await supabase
    .from("pitch_game_pitches")
    .select("batter_id, pitch_games!inner(season, game_type)")
    .eq("pitcher_id", pitcherId)
    .eq("pitch_games.season", season)
    .eq("pitch_games.game_type", "R")
    .not("batter_id", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const batterIds = Array.from(
    new Set(
      (rows ?? [])
        .map((r) => r.batter_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  );

  // Resolve names. fetchPersonsCached batches in chunks of 50 with
  // force-cache, so the second hit on the same season is free.
  const personMap = await fetchPersonsCached(batterIds);
  const batters: Array<{ id: number; fullName: string }> = [];
  for (const id of batterIds) {
    const p = personMap.get(id);
    if (!p) continue;
    if (p.fullName.toLowerCase().includes(q)) {
      batters.push({ id, fullName: p.fullName });
    }
  }
  batters.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return NextResponse.json(
    { batters: batters.slice(0, 12) },
    { headers: { "cache-control": "public, max-age=120" } },
  );
}
