import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { fetchGameResults, type MlbGameResult } from "@/lib/statsapi/client";
import { teamLogoUrl } from "@/lib/viz/headshot";

// Homepage strip — yesterday's MLB results, one card per Final
// regular-season game. Each card links to /at-bat/[gamePk] so the
// user lands on the per-game at-bat browser and can dig into any
// pitcher's outing.
//
// Renders nothing if the Stats API call fails or yesterday had no
// final regular-season games (e.g. off-day, preseason).

export async function YesterdayGamesStrip() {
  // "Yesterday" in America/New_York — the canonical baseball day
  // boundary. en-CA's date format is YYYY-MM-DD which is what the
  // Stats API expects.
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString(
    "en-CA",
    { timeZone: "America/New_York" },
  );

  let games: MlbGameResult[] = [];
  try {
    games = await fetchGameResults(yesterdayIso);
  } catch {
    return null;
  }

  // Only Final regular-season games. abstractGameState="Final" covers
  // F (final), D (delayed), W (warmup), A (active) — we want F only,
  // so check both abstract + detailed.
  const finals = games.filter(
    (g) =>
      g.gameType === "R" &&
      g.status.abstractGameState === "Final" &&
      g.home.score != null &&
      g.away.score != null,
  );
  if (finals.length === 0) return null;

  // Pull team abbreviations from supabase so the card has logos +
  // 2-3 letter team codes that match the rest of the site's chrome.
  const supabase = await createClient();
  const teamIds = Array.from(
    new Set(finals.flatMap((g) => [g.home.teamId, g.away.teamId])),
  );
  const { data: teamRows } = await supabase
    .from("pitch_teams")
    .select("mlb_id, abbreviation")
    .in("mlb_id", teamIds);
  const abbrById = new Map<number, string>(
    (teamRows ?? []).map((t) => [t.mlb_id, t.abbreviation]),
  );

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-white/55">
          Yesterday&apos;s games
        </h2>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/35 tabular-nums">
          {yesterdayIso}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {finals.map((g) => (
          <GameCard key={g.gamePk} g={g} abbrById={abbrById} />
        ))}
      </div>
    </section>
  );
}

function GameCard({
  g,
  abbrById,
}: {
  g: MlbGameResult;
  abbrById: Map<number, string>;
}) {
  const awayAbbr = abbrById.get(g.away.teamId) ?? "?";
  const homeAbbr = abbrById.get(g.home.teamId) ?? "?";
  const awayScore = g.away.score ?? 0;
  const homeScore = g.home.score ?? 0;
  const awayWon = awayScore > homeScore;
  const showStatusNote =
    g.status.detailedState !== "Final" && g.status.detailedState.length > 0;

  return (
    <Link
      href={`/at-bat/${g.gamePk}`}
      className="block rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 hover:border-white/20 transition-colors p-3 space-y-2"
    >
      <div className="space-y-1">
        <TeamScoreRow
          teamId={g.away.teamId}
          abbr={awayAbbr}
          score={awayScore}
          won={awayWon}
        />
        <TeamScoreRow
          teamId={g.home.teamId}
          abbr={homeAbbr}
          score={homeScore}
          won={!awayWon}
        />
      </div>
      {showStatusNote ? (
        <div className="text-[9.5px] uppercase tracking-[0.12em] text-white/40">
          {g.status.detailedState}
        </div>
      ) : null}
      {g.decisions.winner || g.decisions.loser || g.decisions.save ? (
        <div className="border-t border-white/[0.08] pt-2 space-y-0.5 text-[10.5px] tabular-nums">
          {g.decisions.winner ? (
            <DecisionRow color="text-emerald-300/90" tag="W" name={g.decisions.winner.fullName} />
          ) : null}
          {g.decisions.loser ? (
            <DecisionRow color="text-red-300/90" tag="L" name={g.decisions.loser.fullName} />
          ) : null}
          {g.decisions.save ? (
            <DecisionRow color="text-amber-300/90" tag="SV" name={g.decisions.save.fullName} />
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}

function TeamScoreRow({
  teamId,
  abbr,
  score,
  won,
}: {
  teamId: number;
  abbr: string;
  score: number;
  won: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative w-6 h-6 flex-shrink-0">
        <Image
          src={teamLogoUrl(teamId)}
          alt=""
          fill
          sizes="24px"
          className="object-contain"
          unoptimized
        />
      </div>
      <span
        className={
          "text-sm flex-1 " +
          (won ? "text-white font-semibold" : "text-white/70")
        }
      >
        {abbr}
      </span>
      <span
        className={
          "text-sm tabular-nums " +
          (won ? "text-white font-semibold" : "text-white/55")
        }
      >
        {score}
      </span>
    </div>
  );
}

function DecisionRow({
  color,
  tag,
  name,
}: {
  color: string;
  tag: string;
  name: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`${color} font-semibold uppercase tracking-[0.08em] w-6 flex-shrink-0`}
      >
        {tag}
      </span>
      <span className="text-white/85 truncate">{shortenName(name)}</span>
    </div>
  );
}

// "Garrett Crochet" → "G. Crochet". Keeps the card width tight so
// three columns fit on desktop without truncating names.
function shortenName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  const first = parts[0];
  const rest = parts.slice(1).join(" ");
  return `${first[0]}. ${rest}`;
}
