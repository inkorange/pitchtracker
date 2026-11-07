import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTeams } from "@/lib/statsapi/client";
import { pickChangedRows } from "@/lib/cron/changed-rows";

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

  // Only write teams whose details actually moved. 30 rows upserted
  // daily is small, but it rewrote every one of them for data that has
  // not changed in months; see lib/cron/changed-rows.ts.
  const { data: storedRows, error: readErr } = await supabase
    .from("pitch_teams")
    .select("mlb_id, name, abbreviation, league, division");
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  const stored = new Map((storedRows ?? []).map((r) => [r.mlb_id, r]));
  const changed = pickChangedRows(rows, stored, (r) => r.mlb_id, [
    "name",
    "abbreviation",
    "league",
    "division",
  ]);

  if (changed.length > 0) {
    const { error } = await supabase.from("pitch_teams").upsert(changed);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ seen: rows.length, refreshed: changed.length });
}

// MLB returns "American League East"; we store "AL East" for compactness.
function shortenDivision(full: string): string {
  return full
    .replace("American League", "AL")
    .replace("National League", "NL")
    .replace(/\s+/g, " ")
    .trim();
}
