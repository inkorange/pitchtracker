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
// Both shapes return: { batters: [{ id, fullName, teamId }] }, where
// teamId is the team the batter was on the most recent time this
// pitcher faced him (derived from inning_topbot + the game's
// home/away team ids).

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface BatterResult {
  id: number;
  fullName: string;
  teamId: number | null;
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
  // games. We need every row (not distinct) so we can both rank
  // batters by pitches-faced (suggestion mode) and pick each batter's
  // most-recent team for the team-logo badge in the picker UI.
  interface PitchRow {
    batter_id: number | null;
    inning_topbot: string | null;
    pitch_games: {
      season: number;
      game_type: string | null;
      game_date: string;
      home_team_id: number | null;
      away_team_id: number | null;
    } | null;
  }
  const { data, error } = await supabase
    .from("pitch_game_pitches")
    .select(
      "batter_id, inning_topbot, pitch_games!inner(season, game_type, game_date, home_team_id, away_team_id)",
    )
    .eq("pitcher_id", pitcherId)
    .eq("pitch_games.season", season)
    .eq("pitch_games.game_type", "R")
    .not("batter_id", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as PitchRow[];

  // Per-batter aggregate: pitches-faced count + the most-recent
  // (game_date, team_id) we saw them on. Top half = away batting,
  // bottom = home batting; if inning_topbot is missing the row's
  // team contribution is dropped.
  interface BatterAgg {
    count: number;
    lastDate: string;
    lastTeamId: number | null;
  }
  const agg = new Map<number, BatterAgg>();
  for (const r of rows) {
    const bid = r.batter_id;
    if (typeof bid !== "number") continue;
    const meta = r.pitch_games;
    const date = meta?.game_date ?? "";
    let teamId: number | null = null;
    if (r.inning_topbot === "Top") teamId = meta?.away_team_id ?? null;
    else if (r.inning_topbot === "Bot") teamId = meta?.home_team_id ?? null;
    const prior = agg.get(bid);
    if (!prior) {
      agg.set(bid, { count: 1, lastDate: date, lastTeamId: teamId });
      continue;
    }
    prior.count += 1;
    if (date > prior.lastDate) {
      prior.lastDate = date;
      prior.lastTeamId = teamId;
    }
  }

  if (q.length === 0) {
    // Suggestion mode: top-N most-faced. Ranking has natural ties; a
    // secondary sort by id keeps the order stable across requests.
    const topIds = Array.from(agg.entries())
      .sort((a, b) => b[1].count - a[1].count || a[0] - b[0])
      .slice(0, SUGGESTION_LIMIT)
      .map(([bid]) => bid);
    const personMap = await fetchPersonsCached(topIds);
    const batters: BatterResult[] = [];
    for (const bid of topIds) {
      const p = personMap.get(bid);
      if (!p) continue;
      batters.push({
        id: bid,
        fullName: p.fullName,
        teamId: agg.get(bid)?.lastTeamId ?? null,
      });
    }
    return NextResponse.json(
      { batters },
      { headers: { "cache-control": "public, max-age=120" } },
    );
  }

  // Search mode: substring match against the resolved name set.
  const batterIds = Array.from(agg.keys());
  const personMap = await fetchPersonsCached(batterIds);
  const matches: BatterResult[] = [];
  for (const bid of batterIds) {
    const p = personMap.get(bid);
    if (!p) continue;
    if (p.fullName.toLowerCase().includes(q)) {
      matches.push({
        id: bid,
        fullName: p.fullName,
        teamId: agg.get(bid)?.lastTeamId ?? null,
      });
    }
  }
  matches.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return NextResponse.json(
    { batters: matches.slice(0, SEARCH_LIMIT) },
    { headers: { "cache-control": "public, max-age=120" } },
  );
}
