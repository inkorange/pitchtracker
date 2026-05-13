import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTeamBatters, fetchPerson } from "@/lib/statsapi/client";

export const maxDuration = 300;

// Refreshes the pitch_batters table by walking every team's full-season
// position-player roster for the active season, deduping batter IDs, and
// upserting per-player metadata (handedness, debut, etc.) from /people/{id}.
//
// Mirrors refresh-pitchers exactly — same shape, different position
// filter and `bats` instead of `throws`.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const season = Number(url.searchParams.get("season")) || new Date().getFullYear();

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

  const batterIds = new Set<number>();
  const batterTeam = new Map<number, number>();
  for (const team of teams) {
    const roster = await fetchTeamBatters(team.mlb_id, season);
    for (const b of roster) {
      batterIds.add(b.id);
      batterTeam.set(b.id, team.mlb_id);
    }
  }

  const rows: Array<{
    mlb_id: number;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    bats: string | null;
    current_team_id: number | null;
    debut_year: number | null;
    last_active_year: number | null;
    updated_at: string;
  }> = [];
  for (const id of batterIds) {
    const person = await fetchPerson(id);
    if (!person) continue;
    rows.push({
      mlb_id: person.id,
      full_name: person.fullName,
      first_name: person.firstName ?? null,
      last_name: person.lastName ?? null,
      bats: person.batSide?.code ?? null,
      current_team_id: batterTeam.get(id) ?? null,
      debut_year: person.mlbDebutDate ? Number(person.mlbDebutDate.slice(0, 4)) : null,
      last_active_year: season,
      updated_at: new Date().toISOString(),
    });
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from("pitch_batters").upsert(chunk);
    if (error) {
      return NextResponse.json(
        { error: error.message, written },
        { status: 500 },
      );
    }
    written += chunk.length;
  }

  return NextResponse.json({ season, refreshed: written });
}
