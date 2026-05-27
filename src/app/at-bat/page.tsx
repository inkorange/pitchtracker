import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchGameResults, type MlbGameResult } from "@/lib/statsapi/client";
import { TopNav } from "@/components/chrome/TopNav";
import { GameCard } from "@/components/games/GameCard";

export const metadata: Metadata = {
  title: "At-bat replay · pitchtracker",
};

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

  // Default the date input to yesterday in America/New_York — the
  // canonical "baseball day" boundary regardless of where the user is.
  // en-CA locale outputs YYYY-MM-DD which is what <input type="date">
  // expects.
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString(
    "en-CA",
    { timeZone: "America/New_York" },
  );

  // Date-scoped games list: defaults to yesterday's slate when the
  // user hasn't searched yet. Sourced from MLB Stats (hydrated with
  // linescore + decisions) so each card can show scores + W/L/SV,
  // not just the team-vs-team line. The destination /at-bat/[gamePk]
  // page lazy-fetches pitches from Savant on first visit so we don't
  // need to pre-filter to cached games.
  const queryDate = sp.date ?? yesterdayIso;
  let games: MlbGameResult[] = [];
  try {
    const all = await fetchGameResults(queryDate);
    games = all
      .filter((g) => g.gameType === "R")
      .sort((a, b) => a.gamePk - b.gamePk);
  } catch {
    games = [];
  }

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

  const listHeading = sp.date
    ? `Games on ${sp.date}`
    : `Yesterday's games (${yesterdayIso})`;
  const emptyMessage = `No regular-season games scheduled on ${queryDate}.`;

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {games.map((g) => (
                <GameCard
                  key={g.gamePk}
                  game={g}
                  awayAbbr={teamById.get(g.away.teamId)?.abbreviation ?? "?"}
                  homeAbbr={teamById.get(g.home.teamId)?.abbreviation ?? "?"}
                />
              ))}
            </div>
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
