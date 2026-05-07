import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensurePitcherSeasonCache } from "@/lib/cache/backfill";
import { fetchPersonsCached } from "@/lib/statsapi/client";

// Typeahead + team-filter feed for the "Find at-bats" picker on
// /pitcher/[id]. Scoped to batters/teams this pitcher actually faced
// in the selected season — we don't need to surface the full MLB
// roster here, and we don't have a `pitch_batters` table to search
// anyway. The batter ID universe is computed server-side from
// pitch_game_pitches; names come from the MLB Stats API (cached by
// fetchPersonsCached).
//
//   GET /api/pitcher/[id]/batters?season=Y&q=trout
//     Substring match on batter name; up to 12 results sorted by name.
//   GET /api/pitcher/[id]/batters?season=Y                (no q)
//     Returns the 10 most-faced batters this season AND the full
//     list of teams faced (one per opposing team, with each team's
//     most-recent game date + game count).
//   GET /api/pitcher/[id]/batters?season=Y&teamId=N
//     All batters this pitcher faced while they were on team N this
//     season, sorted by name. Catches mid-season trades — a batter
//     traded to N partway through the year shows up here only for
//     the N-side appearances.
// All shapes return: { batters: [{ id, fullName, teamId }] }; the
// no-q shape additionally returns `teams: TeamResult[]`.

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface BatterResult {
  id: number;
  fullName: string;
  teamId: number | null;
}

interface TeamResult {
  id: number;
  abbr: string;
  name: string;
  gameCount: number;
  lastDate: string;
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
  const teamIdParam = url.searchParams.get("teamId");
  const filterTeamId = teamIdParam ? Number(teamIdParam) : null;
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
  // games. We need every row (not distinct) so we can rank batters
  // by pitches-faced AND track each batter's set of teams (for the
  // teamId filter — handles mid-season trades correctly), plus a
  // per-team aggregate for the suggestions sidebar.
  interface PitchRow {
    batter_id: number | null;
    inning_topbot: string | null;
    pitch_games: {
      season: number;
      game_type: string | null;
      game_date: string;
      game_pk: number;
      home_team_id: number | null;
      away_team_id: number | null;
    } | null;
  }
  const { data, error } = await supabase
    .from("pitch_game_pitches")
    .select(
      "batter_id, inning_topbot, pitch_games!inner(season, game_type, game_date, game_pk, home_team_id, away_team_id)",
    )
    .eq("pitcher_id", pitcherId)
    .eq("pitch_games.season", season)
    .eq("pitch_games.game_type", "R")
    .not("batter_id", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as PitchRow[];

  // Per-batter aggregate: pitches-faced count, the most-recent
  // (game_date, team_id) we saw them on, and the full set of teams
  // they were on while facing this pitcher.
  interface BatterAgg {
    count: number;
    lastDate: string;
    lastTeamId: number | null;
    teams: Set<number>;
  }
  const agg = new Map<number, BatterAgg>();

  // Per-team aggregate for the suggestions sidebar: distinct games
  // faced + most-recent date.
  interface TeamAgg {
    games: Set<number>;
    lastDate: string;
  }
  const teamAgg = new Map<number, TeamAgg>();

  for (const r of rows) {
    const bid = r.batter_id;
    if (typeof bid !== "number") continue;
    const meta = r.pitch_games;
    const date = meta?.game_date ?? "";
    const gamePk = meta?.game_pk;
    let rowTeamId: number | null = null;
    if (r.inning_topbot === "Top") rowTeamId = meta?.away_team_id ?? null;
    else if (r.inning_topbot === "Bot") rowTeamId = meta?.home_team_id ?? null;

    const prior = agg.get(bid);
    if (!prior) {
      const teams = new Set<number>();
      if (rowTeamId !== null) teams.add(rowTeamId);
      agg.set(bid, {
        count: 1,
        lastDate: date,
        lastTeamId: rowTeamId,
        teams,
      });
    } else {
      prior.count += 1;
      if (rowTeamId !== null) prior.teams.add(rowTeamId);
      if (date > prior.lastDate) {
        prior.lastDate = date;
        prior.lastTeamId = rowTeamId;
      }
    }

    if (rowTeamId !== null && typeof gamePk === "number") {
      const t = teamAgg.get(rowTeamId);
      if (!t) {
        teamAgg.set(rowTeamId, {
          games: new Set([gamePk]),
          lastDate: date,
        });
      } else {
        t.games.add(gamePk);
        if (date > t.lastDate) t.lastDate = date;
      }
    }
  }

  // Team-filter mode: list all batters who faced this pitcher while
  // on the given team. Skips the q-search path entirely.
  if (filterTeamId !== null && Number.isFinite(filterTeamId)) {
    const matchingIds = Array.from(agg.entries())
      .filter(([, a]) => a.teams.has(filterTeamId))
      .map(([bid]) => bid);
    const personMap = await fetchPersonsCached(matchingIds);
    const batters: BatterResult[] = [];
    for (const bid of matchingIds) {
      const p = personMap.get(bid);
      if (!p) continue;
      batters.push({
        id: bid,
        fullName: p.fullName,
        teamId: filterTeamId,
      });
    }
    batters.sort((a, b) => a.fullName.localeCompare(b.fullName));
    return NextResponse.json(
      { batters },
      { headers: { "cache-control": "public, max-age=120" } },
    );
  }

  if (q.length === 0) {
    // Suggestion mode: top-N most-faced batters + the teams sidebar.
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

    // Teams sidebar — resolve abbreviations + names in one query.
    const teamIds = Array.from(teamAgg.keys());
    let teams: TeamResult[] = [];
    if (teamIds.length > 0) {
      const { data: teamRows } = await supabase
        .from("pitch_teams")
        .select("mlb_id, abbreviation, name")
        .in("mlb_id", teamIds);
      const teamMeta = new Map<number, { abbr: string; name: string }>(
        (teamRows ?? []).map((t) => [
          t.mlb_id,
          { abbr: t.abbreviation, name: t.name },
        ]),
      );
      teams = teamIds.map((tid) => {
        const meta = teamMeta.get(tid);
        const a = teamAgg.get(tid)!;
        return {
          id: tid,
          abbr: meta?.abbr ?? "?",
          name: meta?.name ?? "?",
          gameCount: a.games.size,
          lastDate: a.lastDate,
        };
      });
      // Most-recently-faced first; ties on date fall back to abbr.
      teams.sort(
        (a, b) =>
          b.lastDate.localeCompare(a.lastDate) || a.abbr.localeCompare(b.abbr),
      );
    }

    return NextResponse.json(
      { batters, teams },
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
