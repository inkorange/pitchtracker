import Link from "next/link";
import Image from "next/image";
import type { MlbGameResult } from "@/lib/statsapi/client";
import { teamLogoUrl } from "@/lib/viz/headshot";

// Shared game-result card used by:
//   - the homepage YesterdayGamesStrip
//   - the /at-bat date listing
//
// Each card links to /at-bat/<gamePk> for the at-bat browser, shows
// final scores with the winning team bolded, an optional status chip
// for non-Final states (In Progress / Postponed / etc.), and W / L /
// SV decisions on a single wrap-friendly line below.

interface GameCardProps {
  game: MlbGameResult;
  awayAbbr: string;
  homeAbbr: string;
}

export function GameCard({ game, awayAbbr, homeAbbr }: GameCardProps) {
  const awayScore = game.away.score ?? 0;
  const homeScore = game.home.score ?? 0;
  const hasScores = game.away.score != null && game.home.score != null;
  const awayWon = hasScores && awayScore > homeScore;
  const homeWon = hasScores && homeScore > awayScore;
  const showStatusNote =
    game.status.detailedState !== "Final" && game.status.detailedState.length > 0;
  const hasDecisions =
    game.decisions.winner || game.decisions.loser || game.decisions.save;

  return (
    <Link
      href={`/at-bat/${game.gamePk}`}
      className="block rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 hover:border-white/20 transition-colors px-3 py-2.5 space-y-1.5"
    >
      <div className="space-y-0.5">
        <TeamScoreRow
          teamId={game.away.teamId}
          abbr={awayAbbr}
          score={hasScores ? awayScore : null}
          won={awayWon}
          statusChip={showStatusNote ? game.status.detailedState : null}
        />
        <TeamScoreRow
          teamId={game.home.teamId}
          abbr={homeAbbr}
          score={hasScores ? homeScore : null}
          won={homeWon}
        />
      </div>
      {hasDecisions ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10.5px] tabular-nums pt-1.5 border-t border-white/[0.06]">
          {game.decisions.winner ? (
            <DecisionInline color="text-emerald-300/90" tag="W" name={game.decisions.winner.fullName} />
          ) : null}
          {game.decisions.loser ? (
            <DecisionInline color="text-red-300/90" tag="L" name={game.decisions.loser.fullName} />
          ) : null}
          {game.decisions.save ? (
            <DecisionInline color="text-amber-300/90" tag="SV" name={game.decisions.save.fullName} />
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
  statusChip,
}: {
  teamId: number;
  abbr: string;
  score: number | null;
  won: boolean;
  statusChip?: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-5 h-5 flex-shrink-0">
        <Image
          src={teamLogoUrl(teamId)}
          alt=""
          fill
          sizes="20px"
          className="object-contain"
          unoptimized
        />
      </div>
      <span
        className={
          "text-[13px] flex-1 " +
          (won ? "text-white font-semibold" : "text-white/70")
        }
      >
        {abbr}
      </span>
      {statusChip ? (
        <span className="text-[9px] uppercase tracking-[0.12em] text-white/40">
          {statusChip}
        </span>
      ) : null}
      <span
        className={
          "text-[13px] tabular-nums w-5 text-right " +
          (won ? "text-white font-semibold" : "text-white/55")
        }
      >
        {score ?? "—"}
      </span>
    </div>
  );
}

function DecisionInline({
  color,
  tag,
  name,
}: {
  color: string;
  tag: string;
  name: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`${color} font-semibold uppercase tracking-[0.08em]`}>
        {tag}
      </span>
      <span className="text-white/85">{shortenName(name)}</span>
    </span>
  );
}

// "Garrett Crochet" → "G. Crochet". Keeps the decisions row narrow
// enough to fit three columns of cards on desktop without truncating.
function shortenName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}
