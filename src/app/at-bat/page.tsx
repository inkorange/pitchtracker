import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { teamLogoUrl } from "@/lib/viz/headshot";
import { TopNav } from "@/components/chrome/TopNav";

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

interface TeamRow {
  mlb_id: number;
  abbreviation: string;
  name: string;
}

interface PageProps {
  searchParams: Promise<{ error?: string; team?: string; date?: string }>;
}

export default async function AtBatIndex({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();

  // All 30 MLB teams — used for the lookup form and to resolve
  // abbreviations on the games list below.
  const { data: teamsRaw } = await supabase
    .from("pitch_teams")
    .select("mlb_id, abbreviation, name")
    .order("name");
  const teams = (teamsRaw ?? []) as TeamRow[];
  const teamById = new Map(teams.map((t) => [t.mlb_id, t]));

  // Two modes for the games list below:
  //   - sp.date set (date-only search): every regular-season game on
  //     that date, sourced from the schedule table. Clicking into an
  //     uncached game is safe — the destination /at-bat/[gamePk] page
  //     calls ensureGameCache() to lazy-fetch from Savant on first
  //     visit, so we no longer have to filter to pre-cached games.
  //   - default: most-recently-cached games derived from
  //     pitch_pitcher_games.
  let games: GameRow[] = [];
  if (sp.date) {
    const { data: rows } = await supabase
      .from("pitch_games")
      .select("game_pk, game_date, home_team_id, away_team_id, season")
      .eq("game_date", sp.date)
      .eq("game_type", "R")
      .order("game_pk", { ascending: true });
    games = (rows ?? []) as GameRow[];
  } else {
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

    games = orderedGamePks
      .map((pk) => gameByPk.get(pk))
      .filter((g): g is GameRow => g !== undefined)
      .sort((a, b) => b.game_date.localeCompare(a.game_date));
  }

  // Default the date input to yesterday in America/New_York — the
  // canonical "baseball day" boundary regardless of where the user is.
  // en-CA locale outputs YYYY-MM-DD which is what <input type="date">
  // expects.
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString(
    "en-CA",
    { timeZone: "America/New_York" },
  );

  const errorMessage = (() => {
    if (sp.error === "notfound") {
      const team = teams.find((t) => String(t.mlb_id) === sp.team);
      const teamLabel = team?.name ?? "that team";
      const dateLabel = sp.date ?? "that date";
      return games.length > 0
        ? `${teamLabel} didn't play on ${dateLabel}. Other games that day are listed below.`
        : `No regular-season game for ${teamLabel} on ${dateLabel}.`;
    }
    if (sp.error === "missing") {
      return "Pick a date to find a game.";
    }
    return null;
  })();

  const listHeading = sp.date ? `Games on ${sp.date}` : "Recent games";
  const emptyMessage = sp.date
    ? `No regular-season games scheduled on ${sp.date}.`
    : "No games available yet. Visit a pitcher's page to load their season data.";

  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 pt-20 pb-12">
      <TopNav back={{ href: "/", label: "Home" }} title="At-bat replays" />
      <div className="max-w-3xl mx-auto space-y-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">At-bat replays</h1>
          <p className="text-sm text-white/55 max-w-prose">
            Pick a date to see every game that day, or add a team to
            jump straight to one matchup.
          </p>
        </div>

        <TeamDateLookupForm
          teams={teams}
          defaultDate={yesterdayIso}
          initialTeam={sp.team}
          initialDate={sp.date}
        />
        {errorMessage ? (
          <p className="text-[12px] text-amber-400/85 -mt-6">{errorMessage}</p>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-white/55">
            {listHeading}
          </h2>
          {games.length === 0 ? (
            <p className="text-sm text-white/55">{emptyMessage}</p>
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

function TeamDateLookupForm({
  teams,
  defaultDate,
  initialTeam,
  initialDate,
}: {
  teams: TeamRow[];
  defaultDate: string;
  initialTeam?: string;
  initialDate?: string;
}) {
  // Plain GET form posts to /at-bat/lookup, which resolves the
  // (team, date) pair to a game_pk and 302s to /at-bat/[gamePk].
  // Keeps this page a server component with no client JS for the
  // lookup itself.
  return (
    <form
      action="/at-bat/lookup"
      method="get"
      className="flex flex-wrap gap-3 items-end p-4 rounded-lg bg-white/[0.04] border border-white/10"
    >
      <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
        <label
          htmlFor="team"
          className="text-[10px] uppercase tracking-[0.14em] text-white/45"
        >
          Team <span className="text-white/30 normal-case">(optional)</span>
        </label>
        <select
          id="team"
          name="team"
          defaultValue={initialTeam ?? ""}
          className="px-3 py-1.5 rounded bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-white/25"
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.mlb_id} value={t.mlb_id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="date"
          className="text-[10px] uppercase tracking-[0.14em] text-white/45"
        >
          Date
        </label>
        <input
          id="date"
          name="date"
          type="date"
          required
          defaultValue={initialDate ?? defaultDate}
          className="px-3 py-1.5 rounded bg-black/40 border border-white/10 text-white text-sm tabular-nums focus:outline-none focus:border-white/25"
        />
      </div>
      <button
        type="submit"
        className="px-3 py-1.5 rounded text-[11px] uppercase tracking-[0.14em] bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 text-white transition-colors"
      >
        Find game
      </button>
    </form>
  );
}
