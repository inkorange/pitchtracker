import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCachedDisplaySeason, getCachedTeamMap } from "@/lib/pitcher/cached-reads";
import { fetchSeasonPitchingLines } from "@/lib/statsapi/client";
import { pitcherPagePath } from "@/lib/url/pitcher-slug";
import {
  buildPitchLines,
  roleFor,
  summarizeLines,
  type AggregateInput,
  type DirectoryRow,
} from "./directory-shapes";

export * from "./directory-shapes";

// Server loader for /pitchers. Reads per-pitch-type season aggregates
// for every pitcher (pitch_pitcher_aggregates, batter_hand '*'), names
// and handedness (pitch_pitchers), teams, and K / starts from the MLB
// Stats API, then folds them into one row per pitcher.
//
// NOTE: pitch_pitcher_aggregates is frozen at the end of 2026 — its
// refresh job was unscheduled 2026-10-27 (see vercel.ts, "SPRING 2027
// DECISION"). Once 2027 games start this page shows stale arsenal
// numbers until that pipeline is revived or replaced.

const PAGE = 1000; // PostgREST's server-side row cap; .range() can't raise it.
const ID_CHUNK = 300;

type AggRow = AggregateInput & { pitcher_id: number };

async function loadAggregates(season: number): Promise<AggRow[]> {
  const supabase = await createClient();
  const out: AggRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("pitch_pitcher_aggregates")
      .select(
        "pitcher_id, pitch_type, pitch_count, usage_pct, avg_velocity, avg_spin_rate, avg_horizontal_break, avg_induced_vertical_break, whiff_rate",
      )
      .eq("season", season)
      .eq("batter_hand", "*")
      .order("pitcher_id")
      .order("pitch_type")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function loadPitchers(ids: number[]) {
  const supabase = await createClient();
  const chunks = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  const results = await Promise.all(
    chunks.map((c) =>
      supabase
        .from("pitch_pitchers")
        .select("mlb_id, full_name, throws, current_team_id")
        .in("mlb_id", c),
    ),
  );
  return results.flatMap((r) => {
    if (r.error) throw r.error;
    return r.data ?? [];
  });
}

export const getPitcherDirectory = unstable_cache(
  async (): Promise<{ season: number; rows: DirectoryRow[] }> => {
    const season = await getCachedDisplaySeason();
    const [aggs, teams, lines] = await Promise.all([
      loadAggregates(season),
      getCachedTeamMap(),
      // A Stats API outage shouldn't take the page down; K / role go blank.
      fetchSeasonPitchingLines(season).catch((err) => {
        console.error("[pitchers] season pitching lines failed:", err);
        return [];
      }),
    ]);

    const byPitcher = new Map<number, AggRow[]>();
    for (const a of aggs) {
      const arr = byPitcher.get(a.pitcher_id) ?? [];
      arr.push(a);
      byPitcher.set(a.pitcher_id, arr);
    }
    const people = await loadPitchers([...byPitcher.keys()]);
    const personById = new Map(people.map((p) => [p.mlb_id, p]));
    const lineById = new Map(lines.map((l) => [l.playerId, l]));

    const rows: DirectoryRow[] = [];
    for (const [id, aggRows] of byPitcher) {
      const person = personById.get(id);
      if (!person) continue;
      const mix = buildPitchLines(aggRows);
      const line = lineById.get(id);
      const teamId = line?.teamId ?? person.current_team_id;
      rows.push({
        id,
        name: person.full_name,
        href: pitcherPagePath(id, person.full_name),
        teamId,
        team: teamId ? (teams.get(teamId)?.abbreviation ?? null) : null,
        hand: person.throws,
        role: line ? roleFor(line.gamesStarted, line.gamesPitched) : null,
        strikeouts: line?.strikeouts ?? null,
        ...summarizeLines(mix),
        mix,
      });
    }
    return { season, rows };
  },
  ["pitcher-directory-v1"],
  { revalidate: 60 * 60, tags: ["pitch-pitchers", "pitch-aggregates"] },
);
