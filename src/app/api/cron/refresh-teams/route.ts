import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTeams } from "@/lib/statsapi/client";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const teams = await fetchTeams();
  const supabase = createAdminClient();

  const rows = teams.map((t) => ({
    mlb_id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    league: t.league.includes("American") ? "AL" : "NL",
    division: shortenDivision(t.division),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("pitch_teams").upsert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ refreshed: rows.length });
}

// MLB returns "American League East"; we store "AL East" for compactness.
function shortenDivision(full: string): string {
  return full
    .replace("American League", "AL")
    .replace("National League", "NL")
    .replace(/\s+/g, " ")
    .trim();
}
