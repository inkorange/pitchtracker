import { createClient } from "@/lib/supabase/server";
import { formatShortName } from "@/lib/home/rankings";

// "★ J. Misiorowski · #1 in K" badges for the Teams grid: for each
// leaderboard category, the #1 pitcher's team (the team he pitched the
// most innings for that season). One badge per team — the first
// category in display order wins.

const CATEGORY_LABEL: Record<string, string> = {
  strikeouts: "K",
  velo_ff: "velo",
  whiff_pct: "whiff%",
  csw_pct: "CSW%",
  spin_ff: "spin",
  vaa_flat_ff: "flat VAA",
};
const ORDER = Object.keys(CATEGORY_LABEL);

export async function getLeaderBadges(season: number): Promise<Map<number, string>> {
  const supabase = await createClient();
  const { data: leaders } = await supabase
    .from("pitch_rankings")
    .select("category, pitcher_id")
    .eq("season", season)
    .eq("rank", 1);
  if (!leaders?.length) return new Map();

  const ids = [...new Set(leaders.map((l) => l.pitcher_id))];
  const [{ data: rosters }, { data: people }] = await Promise.all([
    supabase
      .from("pitch_team_rosters")
      .select("pitcher_id, team_id, innings_pitched")
      .eq("season", season)
      .in("pitcher_id", ids),
    supabase.from("pitch_pitchers").select("mlb_id, full_name, first_name, last_name").in("mlb_id", ids),
  ]);
  const teamOf = new Map<number, { team: number; ip: number }>();
  for (const r of rosters ?? []) {
    const cur = teamOf.get(r.pitcher_id);
    const ip = r.innings_pitched ?? 0;
    if (!cur || ip > cur.ip) teamOf.set(r.pitcher_id, { team: r.team_id, ip });
  }
  const nameOf = new Map((people ?? []).map((p) => [p.mlb_id, formatShortName(p)]));

  const badges = new Map<number, string>();
  for (const cat of ORDER) {
    for (const l of leaders.filter((x) => x.category === cat)) {
      const team = teamOf.get(l.pitcher_id)?.team;
      const name = nameOf.get(l.pitcher_id);
      if (!team || !name || badges.has(team)) continue;
      badges.set(team, `${name} · #1 in ${CATEGORY_LABEL[cat]}`);
    }
  }
  return badges;
}
