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
  // Short-label outcomes (e.g. ["K", "BB", "1B"]) for every at-bat
  // this batter had against the pitcher in the matched scope (team /
  // search / suggestion). Order is insertion (no real chronological
  // sort, but recent ABs cluster late since the pitch query sorts by
  // game). Empty array if no terminating-event data is available.
  results: string[];
}

// Map an MLB event value to a compact pill label. Anything we don't
// recognize falls through as null so the UI can skip it cleanly.
const EVENT_LABEL: Record<string, string> = {
  strikeout: "K",
  strikeout_double_play: "K",
  walk: "BB",
  intent_walk: "BB",
  hit_by_pitch: "HBP",
  single: "1B",
  double: "2B",
  triple: "3B",
  home_run: "HR",
  field_out: "Out",
  force_out: "Out",
  fielders_choice: "Out",
  fielders_choice_out: "Out",
  grounded_into_double_play: "Out",
  double_play: "Out",
  triple_play: "Out",
  sac_fly: "Out",
  sac_bunt: "Out",
  field_error: "E",
  catcher_interf: "CI",
};
function labelForEvent(ev: string | null | undefined): string | null {
  if (!ev) return null;
  return EVENT_LABEL[ev] ?? null;
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
    at_bat_number: number | null;
    events: string | null;
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
      "batter_id, inning_topbot, at_bat_number, events, pitch_games!inner(season, game_type, game_date, game_pk, home_team_id, away_team_id)",
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

  // Per-batter at-bat results. Keyed by `${game_pk}-${at_bat_number}`
  // so we only record one outcome per AB even though many pitch rows
  // share that key. Only the terminating pitch has a non-null events,
  // so the entry is overwritten in that one row and stays null for
  // the others.
  const batterAbResults = new Map<number, Map<string, string>>();

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

    if (r.events && typeof gamePk === "number" && typeof r.at_bat_number === "number") {
      const key = `${gamePk}-${r.at_bat_number}`;
      let perBatter = batterAbResults.get(bid);
      if (!perBatter) {
        perBatter = new Map<string, string>();
        batterAbResults.set(bid, perBatter);
      }
      perBatter.set(key, r.events);
    }
  }

  // Resolve the per-batter event-map into the short-label array the
  // UI renders. Called by every branch (team filter, suggestions,
  // search), so the BatterResult shape stays consistent.
  const resultsFor = (bid: number): string[] => {
    const perBatter = batterAbResults.get(bid);
    if (!perBatter) return [];
    const out: string[] = [];
    for (const ev of perBatter.values()) {
      const label = labelForEvent(ev);
      if (label) out.push(label);
    }
    return out;
  };

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
        results: resultsFor(bid),
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
        results: resultsFor(bid),
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
        results: resultsFor(bid),
      });
    }
  }
  matches.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return NextResponse.json(
    { batters: matches.slice(0, SEARCH_LIMIT) },
    { headers: { "cache-control": "public, max-age=120" } },
  );
}
