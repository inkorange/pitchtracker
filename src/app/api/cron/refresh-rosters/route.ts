import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTeamPitchers } from "@/lib/statsapi/client";

export const maxDuration = 300;

// Refreshes pitch_team_rosters for the requested seasons. Defaults to the
// current season; can be invoked with ?season=YYYY or ?seasons=YYYY,YYYY,YYYY
// to backfill multiple years.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const seasonsParam = url.searchParams.get("seasons");
  const seasons = seasonsParam
    ? seasonsParam.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
    : [Number(url.searchParams.get("season")) || new Date().getFullYear()];

  const supabase = createAdminClient();

  const { data: teams, error: teamsError } = await supabase
    .from("pitch_teams")
    .select("mlb_id");
  if (teamsError) {
    return NextResponse.json({ error: teamsError.message }, { status: 500 });
  }
  if (!teams || teams.length === 0) {
    return NextResponse.json(
      { error: "No teams in pitch_teams. Run refresh-teams first." },
      { status: 400 },
    );
  }

  // Pre-fetch the set of pitchers we know about so we can skip any roster
  // entries for retired or off-roster players that aren't in pitch_pitchers
  // (the FK would otherwise reject them).
  const { data: knownPitcherRows } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id");
  const knownPitchers = new Set((knownPitcherRows ?? []).map((p) => p.mlb_id));

  let written = 0;
  for (const season of seasons) {
    const rows: Array<{
      team_id: number;
      season: number;
      pitcher_id: number;
      innings_pitched: number | null;
      updated_at: string;
    }> = [];
    for (const team of teams) {
      const roster = await fetchTeamPitchers(team.mlb_id, season);
      for (const p of roster) {
        // Skip pitchers we don't have in pitch_pitchers — typically retired
        // players whose metadata wasn't included in the latest pitchers
        // refresh. We'll include them once a backfill of historical
        // pitchers lands.
        if (!knownPitchers.has(p.id)) continue;
        rows.push({
          team_id: team.mlb_id,
          season,
          pitcher_id: p.id,
          innings_pitched: null, // populated by aggregates refresh
          updated_at: new Date().toISOString(),
        });
      }
    }
    // Dedupe by composite key — defensive against API quirks.
    const seen = new Set<string>();
    const deduped = rows.filter((r) => {
      const key = `${r.team_id}-${r.season}-${r.pitcher_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    for (let i = 0; i < deduped.length; i += 200) {
      const chunk = deduped.slice(i, i + 200);
      const { error } = await supabase.from("pitch_team_rosters").upsert(chunk);
      if (error) {
        return NextResponse.json(
          { error: error.message, written },
          { status: 500 },
        );
      }
      written += chunk.length;
    }
  }

  return NextResponse.json({ seasons, refreshed: written });
}
