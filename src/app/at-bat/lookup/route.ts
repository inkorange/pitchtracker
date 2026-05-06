import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Resolve a (team, date) pair to a game and 302 to its at-bat browser.
// Falls back to the legacy (gamePk, atBatNumber) pair so existing
// shareable URLs that hit /at-bat/lookup still work.
export async function GET(request: Request) {
  const url = new URL(request.url);

  // Legacy direct-AB lookup: /at-bat/lookup?gamePk=...&atBatNumber=...
  const gamePk = Number(url.searchParams.get("gamePk"));
  const atBatNumber = Number(url.searchParams.get("atBatNumber"));
  if (Number.isFinite(gamePk) && Number.isFinite(atBatNumber)) {
    return NextResponse.redirect(
      new URL(`/at-bat/${gamePk}/${atBatNumber}`, request.url),
    );
  }

  // New team+date flow.
  const teamId = Number(url.searchParams.get("team"));
  const date = url.searchParams.get("date");

  if (!Number.isFinite(teamId) || !date) {
    return NextResponse.redirect(
      new URL("/at-bat?error=missing", request.url),
    );
  }

  const supabase = await createClient();

  // Find the regular-season game(s) for this team on this date. PostgREST
  // .or() filter — comma-separated alternatives, dot-syntax operators.
  const { data: matches } = await supabase
    .from("pitch_games")
    .select("game_pk, game_date")
    .eq("game_type", "R")
    .eq("game_date", date)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order("game_pk", { ascending: true });

  const games = matches ?? [];
  if (games.length === 0) {
    const back = new URL("/at-bat", request.url);
    back.searchParams.set("error", "notfound");
    back.searchParams.set("team", String(teamId));
    back.searchParams.set("date", date);
    return NextResponse.redirect(back);
  }

  // For doubleheaders we just take the first game; the user can drill
  // into the AB browser and see both halves grouped by inning. A future
  // refinement could surface a chooser, but this is the 99% case.
  return NextResponse.redirect(
    new URL(`/at-bat/${games[0].game_pk}`, request.url),
  );
}
