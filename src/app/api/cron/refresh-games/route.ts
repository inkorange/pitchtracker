import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSchedule } from "@/lib/statsapi/client";
import { pickChangedRows, fetchAllPaged } from "@/lib/cron/changed-rows";

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
    // Use officialDate (MLB's canonical baseball-day field) so games
    // starting late in West / Central time zones — which roll past
    // midnight UTC — get filed under the correct calendar day. The
    // gameDate field is the first-pitch UTC timestamp and was
    // silently bucketing those games into the following day.
    game_date: (g.officialDate ?? g.gameDate.slice(0, 10)),
    season: Number((g.officialDate ?? g.gameDate).slice(0, 4)),
    home_team_id: g.teams.home.team.id,
    away_team_id: g.teams.away.team.id,
    status: g.status.detailedState ?? g.status.abstractGameState ?? "Unknown",
    game_type: g.gameType ?? null,
    venue_name: g.venue?.name ?? null,
    updated_at: new Date().toISOString(),
  }));

  // Write only the games whose schedule row actually moved. This was
  // the largest of the metadata rewrites — the window is 37 days wide,
  // so ~1,500 rows were rewritten daily although a finished game never
  // changes again. Status is the only field that moves in practice, and
  // only for today's games. See lib/cron/changed-rows.ts.
  const COMPARED = [
    "game_date",
    "season",
    "home_team_id",
    "away_team_id",
    "status",
    "game_type",
    "venue_name",
  ] as const;
  // Scoped to the same date window, and paged: in season this select
  // exceeds PostgREST's 1000-row ceiling, which .range() does not lift.
  let stored;
  try {
    stored = new Map(
      (
        await fetchAllPaged((f, t) =>
          supabase
            .from("pitch_games")
            .select(
              "game_pk, game_date, season, home_team_id, away_team_id, status, game_type, venue_name",
            )
            .gte("game_date", from)
            .lte("game_date", to)
            .range(f, t),
        )
      ).map((r) => [r.game_pk, r]),
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
  const changed = pickChangedRows(rows, stored, (r) => r.game_pk, COMPARED);

  let written = 0;
  for (let i = 0; i < changed.length; i += 200) {
    const chunk = changed.slice(i, i + 200);
    const { error } = await supabase.from("pitch_games").upsert(chunk);
    if (error) {
      return NextResponse.json(
        { error: error.message, written },
        { status: 500 },
      );
    }
    written += chunk.length;
  }

  return NextResponse.json({ from, to, seen: rows.length, refreshed: written });
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
