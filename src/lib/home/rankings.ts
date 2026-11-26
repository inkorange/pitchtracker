import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { resolveDisplaySeason } from "@/lib/season/current-season";
import { pitcherPagePath } from "@/lib/url/pitcher-slug";

// Homepage leaderboard data, shared by the leaders ticker and the
// Leaderboards section. Wrapped in React `cache` so both read one set
// of queries per request.
//
// Reads pitch_rankings (populated by /api/cron/refresh-rankings) for
// the display season. Categories are ordered most-recognizable first.

export const RANKING_CATEGORIES = [
  {
    key: "velo_ff",
    title: "Top velocity",
    sub: "4-seam avg",
    tab: "Velo",
    tickerKey: "VELO",
    unit: "mph",
    precision: 1,
    info: "Average 4-seam fastball velocity. Pure power — the radar-gun stat that's been the headline pitching metric for a century.",
  },
  {
    key: "strikeouts",
    title: "Strikeouts",
    sub: "Season total",
    tab: "K",
    tickerKey: "K",
    unit: "K",
    precision: 0,
    info: "Total strikeouts on the season. Influenced by both swing-and-miss stuff and innings pitched.",
  },
  {
    key: "whiff_pct",
    title: "Whiff rate",
    sub: "Swings & misses",
    tab: "Whiff%",
    tickerKey: "WHIFF%",
    unit: "%",
    precision: 1,
    info: "Swinging-strike rate — the share of swings batters miss entirely. Measures how unhittable a pitcher's stuff is when hitters commit to swinging.",
  },
  {
    key: "csw_pct",
    title: "CSW rate",
    sub: "Called + swinging",
    tab: "CSW%",
    tickerKey: "CSW%",
    unit: "%",
    precision: 1,
    info: "Called Strikes + Whiffs as a share of all pitches thrown. Captures both freezing batters with the slider and getting them to chase. One of the best single-pitch indicators of pitcher dominance.",
  },
  {
    key: "spin_ff",
    title: "Spin rate",
    sub: "4-seam avg",
    tab: "Spin",
    tickerKey: "SPIN",
    unit: "rpm",
    precision: 0,
    info: "Average spin rate on the 4-seam fastball, in revolutions per minute. High spin keeps the ball up in the zone (resists gravity), which produces the perceived 'rising fastball' that drives swings under the ball.",
  },
  {
    key: "vaa_flat_ff",
    title: "Flattest VAA",
    sub: "4-seam approach",
    tab: "VAA",
    tickerKey: "VAA",
    unit: "°",
    precision: 2,
    info: "Vertical Approach Angle — the angle (from horizontal) at which the fastball crosses the plate. Flatter angles (closer to 0°) at the top of the zone are extremely hard to hit because the bat must square up a pitch coming in nearly level.",
  },
] as const;

export type RankingCategory = (typeof RANKING_CATEGORIES)[number];

export interface RankingEntry {
  rank: number;
  pitcherId: number;
  /** "S. Ohtani" — first initial + full last name. */
  name: string;
  href: string;
  /** Pre-formatted to the category's precision, without the unit. */
  value: string;
}

export interface RankingBoard {
  category: RankingCategory;
  rows: RankingEntry[];
}

export interface HomeRankings {
  season: number;
  boards: RankingBoard[];
}

export function formatShortName(p: {
  first_name: string | null;
  last_name: string | null;
  full_name: string;
}): string {
  if (p.first_name && p.last_name) return `${p.first_name[0]}. ${p.last_name}`;
  return p.full_name;
}

export const getHomeRankings = cache(async (): Promise<HomeRankings> => {
  const supabase = await createClient();
  // Track the season we hold rankings for, not the calendar year —
  // otherwise this queries an empty season every January.
  const season = await resolveDisplaySeason(supabase);
  const { data: rows } = await supabase
    .from("pitch_rankings")
    .select("category, rank, pitcher_id, value")
    .eq("season", season)
    .order("category")
    .order("rank");

  const rankings = rows ?? [];
  if (rankings.length === 0) return { season, boards: [] };

  const pitcherIds = Array.from(new Set(rankings.map((r) => r.pitcher_id)));
  const { data: pitcherRows } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id, full_name, first_name, last_name")
    .in("mlb_id", pitcherIds);
  const byId = new Map((pitcherRows ?? []).map((p) => [p.mlb_id, p]));

  const boards: RankingBoard[] = [];
  for (const category of RANKING_CATEGORIES) {
    const catRows = rankings.filter((r) => r.category === category.key);
    if (catRows.length === 0) continue;
    boards.push({
      category,
      rows: catRows.map((r) => {
        const p = byId.get(r.pitcher_id);
        return {
          rank: r.rank,
          pitcherId: r.pitcher_id,
          name: p ? formatShortName(p) : `Pitcher #${r.pitcher_id}`,
          // Slugged URL so rows skip the id-only 308 redirect.
          href: p ? pitcherPagePath(p.mlb_id, p.full_name) : `/pitcher/${r.pitcher_id}`,
          value: Number(r.value).toFixed(category.precision),
        };
      }),
    });
  }
  return { season, boards };
});
