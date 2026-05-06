import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSchedule } from "@/lib/statsapi/client";

export const maxDuration = 60;

// Refreshes pitch_games for a date window. Defaults to last 30 days +
// upcoming 7 days. Can be invoked with ?from=YYYY-MM-DD&to=YYYY-MM-DD.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const today = new Date();
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = fromParam ?? isoDate(addDays(today, -30));
  const to = toParam ?? isoDate(addDays(today, 7));

  const games = await fetchSchedule(from, to);
  const supabase = createAdminClient();

  // Restrict to games where both teams are MLB (in pitch_teams). The
  // schedule API also returns spring training / WBC / exhibition games
  // against non-MLB teams that would violate the FK.
  const { data: teamRows } = await supabase.from("pitch_teams").select("mlb_id");
  const validTeamIds = new Set((teamRows ?? []).map((t) => t.mlb_id));

  // The schedule API can return the same gamePk more than once in a window
  // (e.g. resumed games, schedule corrections). Dedupe by game_pk before
  // upserting so we don't violate ON CONFLICT.
  const byPk = new Map<number, (typeof games)[number]>();
  for (const g of games) {
    if (!validTeamIds.has(g.teams.home.team.id) || !validTeamIds.has(g.teams.away.team.id)) {
      continue;
    }
    byPk.set(g.gamePk, g);
  }
  const rows = Array.from(byPk.values()).map((g) => ({
    game_pk: g.gamePk,
    game_date: g.gameDate.slice(0, 10),
    season: Number(g.gameDate.slice(0, 4)),
    home_team_id: g.teams.home.team.id,
    away_team_id: g.teams.away.team.id,
    status: g.status.detailedState ?? g.status.abstractGameState ?? "Unknown",
    game_type: g.gameType ?? null,
    venue_name: g.venue?.name ?? null,
    updated_at: new Date().toISOString(),
  }));

  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from("pitch_games").upsert(chunk);
    if (error) {
      return NextResponse.json(
        { error: error.message, written },
        { status: 500 },
      );
    }
    written += chunk.length;
  }

  return NextResponse.json({ from, to, refreshed: written });
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
