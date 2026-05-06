import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Resolve a (team, date) pair to a game and 302 to its at-bat browser.
// Falls back to the legacy (gamePk, atBatNumber) pair so existing
// shareable URLs that hit /at-bat/lookup still work.
export async function GET(request: Request) {
  const url = new URL(request.url);

  // Legacy direct-AB lookup: /at-bat/lookup?gamePk=...&atBatNumber=...
  // Check string presence first — Number(null) is 0 and Number.isFinite(0)
  // is true, so a naive Number+isFinite check would always hit this branch
  // with the new team/date form (which omits these params).
  const gamePkRaw = url.searchParams.get("gamePk");
  const atBatRaw = url.searchParams.get("atBatNumber");
  if (gamePkRaw && atBatRaw) {
    const gamePk = Number(gamePkRaw);
    const atBatNumber = Number(atBatRaw);
    if (Number.isFinite(gamePk) && Number.isFinite(atBatNumber)) {
      return NextResponse.redirect(
        new URL(`/at-bat/${gamePk}/${atBatNumber}`, request.url),
      );
    }
  }

  // New team+date flow.
  const teamRaw = url.searchParams.get("team");
  const date = url.searchParams.get("date");

  if (!date) {
    return NextResponse.redirect(
      new URL("/at-bat?error=missing", request.url),
    );
  }

  // Date-only: bounce to the index with ?date= so it lists every game
  // on that date. The team is intentionally optional now.
  if (!teamRaw) {
    const back = new URL("/at-bat", request.url);
    back.searchParams.set("date", date);
    return NextResponse.redirect(back);
  }

  const teamId = Number(teamRaw);
  if (!Number.isFinite(teamId)) {
    return NextResponse.redirect(
      new URL("/at-bat?error=missing", request.url),
    );
  }

  const supabase = await createClient();

  // Find the regular-season game(s) for this team on this date.
  // PostgREST .or() — comma-separated alternatives.
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

  // Restrict to games that have cached pitch data — landing on a game
  // with no pitches yields a dead-end "no pitches for this game" stub
  // with no way back to the form.
  const { data: cachedRows } = await supabase
    .from("pitch_pitcher_games")
    .select("game_pk")
    .in(
      "game_pk",
      games.map((g) => g.game_pk),
    );
  const cachedGamePks = new Set((cachedRows ?? []).map((r) => r.game_pk));
  const cachedMatches = games.filter((g) => cachedGamePks.has(g.game_pk));

  if (cachedMatches.length === 0) {
    const back = new URL("/at-bat", request.url);
    back.searchParams.set("error", "notfound");
    back.searchParams.set("team", String(teamId));
    back.searchParams.set("date", date);
    return NextResponse.redirect(back);
  }

  // For doubleheaders we just take the first cached game; the AB
  // browser groups both halves by inning. A future refinement could
  // surface a chooser, but this is the 99% case.
  return NextResponse.redirect(
    new URL(`/at-bat/${cachedMatches[0].game_pk}`, request.url),
  );
}
