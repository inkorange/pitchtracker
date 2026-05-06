import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { teamLogoUrl } from "@/lib/viz/headshot";

export const metadata: Metadata = {
  title: "At-bat replay · pitchtracker",
};

interface GameRow {
  game_pk: number;
  game_date: string;
  home_team_id: number | null;
  away_team_id: number | null;
  season: number;
}

export default async function AtBatIndex() {
  const supabase = await createClient();

  // Pull the most recently fetched (pitcher, game) pairs and dedupe to
  // distinct games. Bounded by how aggressively we've been backfilling,
  // not by the schedule.
  const { data: ppgRows } = await supabase
    .from("pitch_pitcher_games")
    .select("game_pk, fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(500);

  const seenGamePks = new Set<number>();
  const orderedGamePks: number[] = [];
  for (const row of ppgRows ?? []) {
    if (seenGamePks.has(row.game_pk)) continue;
    seenGamePks.add(row.game_pk);
    orderedGamePks.push(row.game_pk);
    if (orderedGamePks.length >= 30) break;
  }

  const { data: gamesRaw } =
    orderedGamePks.length > 0
      ? await supabase
          .from("pitch_games")
          .select("game_pk, game_date, home_team_id, away_team_id, season")
          .in("game_pk", orderedGamePks)
          .eq("game_type", "R")
      : { data: [] };

  const gameByPk = new Map<number, GameRow>();
  for (const g of (gamesRaw ?? []) as GameRow[]) gameByPk.set(g.game_pk, g);

  const games: GameRow[] = orderedGamePks
    .map((pk) => gameByPk.get(pk))
    .filter((g): g is GameRow => g !== undefined)
    .sort((a, b) => b.game_date.localeCompare(a.game_date));

  const teamIds = new Set<number>();
  for (const g of games) {
    if (g.home_team_id) teamIds.add(g.home_team_id);
    if (g.away_team_id) teamIds.add(g.away_team_id);
  }
  const { data: teamsRaw } =
    teamIds.size > 0
      ? await supabase
          .from("pitch_teams")
          .select("mlb_id, abbreviation, name")
          .in("mlb_id", Array.from(teamIds))
      : { data: [] };
  const teamById = new Map(
    (teamsRaw ?? []).map((t) => [t.mlb_id, t]),
  );

  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 py-12">
      <div className="max-w-3xl mx-auto space-y-10">
        <div className="space-y-2">
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors"
          >
            ← pitchtracker
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">At-bat replays</h1>
          <p className="text-sm text-white/55 max-w-prose">
            Pick a recent game to browse its at-bats, or jump directly
            to a specific at-bat by game ID and at-bat number.
          </p>
        </div>

        <DirectLookupForm />

        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-white/55">
            Recent games
          </h2>
          {games.length === 0 ? (
            <p className="text-sm text-white/55">
              No games available yet. Visit a pitcher&apos;s page to load
              their season data.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {games.map((g) => {
                const home = g.home_team_id ? teamById.get(g.home_team_id) : null;
                const away = g.away_team_id ? teamById.get(g.away_team_id) : null;
                return (
                  <li key={g.game_pk}>
                    <Link
                      href={`/at-bat/${g.game_pk}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors"
                    >
                      <div className="flex items-center -space-x-2">
                        {away?.mlb_id ? (
                          <div className="relative w-7 h-7 bg-[#0a0e14] rounded-full p-0.5">
                            <Image
                              src={teamLogoUrl(away.mlb_id)}
                              alt={away.name}
                              fill
                              sizes="28px"
                              className="object-contain"
                              unoptimized
                            />
                          </div>
                        ) : null}
                        {home?.mlb_id ? (
                          <div className="relative w-7 h-7 bg-[#0a0e14] rounded-full p-0.5">
                            <Image
                              src={teamLogoUrl(home.mlb_id)}
                              alt={home.name}
                              fill
                              sizes="28px"
                              className="object-contain"
                              unoptimized
                            />
                          </div>
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white/95 truncate">
                          {away?.abbreviation ?? "?"} @ {home?.abbreviation ?? "?"}
                        </div>
                        <div className="text-[11px] text-white/45 tabular-nums">
                          {g.game_date}
                        </div>
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                        Browse →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function DirectLookupForm() {
  // Server-action approach via a plain GET form: posts to /at-bat/lookup
  // (a route that just redirects to the canonical URL). Keeps this page
  // a pure server component without a client-side router push.
  return (
    <form
      action="/at-bat/lookup"
      method="get"
      className="flex flex-wrap gap-2 items-end p-4 rounded-lg bg-white/[0.04] border border-white/10"
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor="gamePk"
          className="text-[10px] uppercase tracking-[0.14em] text-white/45"
        >
          Game ID
        </label>
        <input
          id="gamePk"
          name="gamePk"
          type="number"
          required
          placeholder="831547"
          className="px-3 py-1.5 rounded bg-black/40 border border-white/10 text-white text-sm tabular-nums focus:outline-none focus:border-white/25 w-32"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="atBatNumber"
          className="text-[10px] uppercase tracking-[0.14em] text-white/45"
        >
          At-bat #
        </label>
        <input
          id="atBatNumber"
          name="atBatNumber"
          type="number"
          required
          placeholder="39"
          className="px-3 py-1.5 rounded bg-black/40 border border-white/10 text-white text-sm tabular-nums focus:outline-none focus:border-white/25 w-24"
        />
      </div>
      <button
        type="submit"
        className="px-3 py-1.5 rounded text-[11px] uppercase tracking-[0.14em] bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 text-white transition-colors"
      >
        Open replay
      </button>
    </form>
  );
}
