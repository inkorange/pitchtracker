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
//     Substring match on batter name; up to 12 results sorted by name.
//   GET /api/pitcher/[id]/batters?season=Y          (no q)
//     Returns the 10 most-faced batters this season — used as
//     suggestions before the user types in the dialog.
// Both shapes return: { batters: [{ id, fullName }] }.

interface RouteParams {
  params: Promise<{ id: string }>;
}

const SUGGESTION_LIMIT = 10;
const SEARCH_LIMIT = 12;

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const pitcherId = Number(id);
  if (!Number.isFinite(pitcherId)) {
    return NextResponse.json({ error: "Invalid pitcher id" }, { status: 400 });
  }
  const url = new URL(request.url);
  const season = Number(url.searchParams.get("season")) || new Date().getFullYear();
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  // Single-letter queries are noisy and rarely useful; reserve the
  // empty-q path for "give me suggestions" and require ≥2 chars for
  // an actual search.
  if (q.length === 1) {
    return NextResponse.json({ batters: [] });
  }

  const supabase = await createClient();
  // First-visit lazy backfill so the batter universe is complete.
  await ensurePitcherSeasonCache(pitcherId, season);

  // All pitches this pitcher threw in this season's regular-season
  // games. We need every row (not distinct) so we can rank batters by
  // pitches-faced for the suggestion mode below.
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

  // Pitch counts per batter — used both to enumerate the universe
  // (for the search path) and to rank suggestions (for the empty-q
  // path). Pitches-faced is a fine proxy for at-bats-faced for
  // ordering purposes.
  const counts = new Map<number, number>();
  for (const r of rows ?? []) {
    const bid = r.batter_id;
    if (typeof bid !== "number") continue;
    counts.set(bid, (counts.get(bid) ?? 0) + 1);
  }

  if (q.length === 0) {
    // Suggestion mode: top-N most-faced. Ranking has natural ties; a
    // secondary sort by id keeps the order stable across requests.
    const topIds = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, SUGGESTION_LIMIT)
      .map(([bid]) => bid);
    const personMap = await fetchPersonsCached(topIds);
    const batters: Array<{ id: number; fullName: string }> = [];
    for (const bid of topIds) {
      const p = personMap.get(bid);
      if (!p) continue;
      batters.push({ id: bid, fullName: p.fullName });
    }
    return NextResponse.json(
      { batters },
      { headers: { "cache-control": "public, max-age=120" } },
    );
  }

  // Search mode: substring match against the resolved name set.
  const batterIds = Array.from(counts.keys());
  const personMap = await fetchPersonsCached(batterIds);
  const matches: Array<{ id: number; fullName: string }> = [];
  for (const bid of batterIds) {
    const p = personMap.get(bid);
    if (!p) continue;
    if (p.fullName.toLowerCase().includes(q)) {
      matches.push({ id: bid, fullName: p.fullName });
    }
  }
  matches.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return NextResponse.json(
    { batters: matches.slice(0, SEARCH_LIMIT) },
    { headers: { "cache-control": "public, max-age=120" } },
  );
}
