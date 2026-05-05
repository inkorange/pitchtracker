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
        rows.push({
          team_id: team.mlb_id,
          season,
          pitcher_id: p.id,
          innings_pitched: null, // populated by aggregates refresh
          updated_at: new Date().toISOString(),
        });
      }
    }
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
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
