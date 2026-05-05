import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTeamPitchers, fetchPerson } from "@/lib/statsapi/client";

export const maxDuration = 300;

// Refreshes the pitch_pitchers table by walking every team's full-season
// roster for the active season, deduping pitcher IDs, and upserting
// per-player metadata (handedness, debut, etc.) from /people/{id}.
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

  // Collect unique pitcher IDs across all teams' rosters.
  const pitcherIds = new Set<number>();
  const pitcherTeam = new Map<number, number>();
  for (const team of teams) {
    const roster = await fetchTeamPitchers(team.mlb_id, season);
    for (const p of roster) {
      pitcherIds.add(p.id);
      // Last-write-wins for current_team_id; fine for the rough "current team" heuristic.
      pitcherTeam.set(p.id, team.mlb_id);
    }
  }

  // Hydrate metadata for each unique pitcher. Sequential to be polite to the API.
  const rows: Array<{
    mlb_id: number;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    throws: string | null;
    current_team_id: number | null;
    debut_year: number | null;
    last_active_year: number | null;
    updated_at: string;
  }> = [];
  for (const id of pitcherIds) {
    const person = await fetchPerson(id);
    if (!person) continue;
    rows.push({
      mlb_id: person.id,
      full_name: person.fullName,
      first_name: person.firstName ?? null,
      last_name: person.lastName ?? null,
      throws: person.pitchHand?.code ?? null,
      current_team_id: pitcherTeam.get(id) ?? null,
      debut_year: person.mlbDebutDate ? Number(person.mlbDebutDate.slice(0, 4)) : null,
      last_active_year: season,
      updated_at: new Date().toISOString(),
    });
  }

  // Batch upsert in chunks of 200 to stay under Postgres parameter limits.
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from("pitch_pitchers").upsert(chunk);
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
