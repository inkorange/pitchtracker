import Link from "next/link";
import type { MlbGameResult } from "@/lib/statsapi/client";
import { TeamLogo } from "@/components/team/TeamLogo";
import { teamNickname } from "@/lib/teams/nicknames";

// Shared game-result card used by:
//   - the homepage YesterdayGamesStrip
//   - the /at-bat date listing
//
// Each card links to /at-bat/<gamePk> for the at-bat browser, shows
// final scores with the winning team bolded, an optional status chip
// for non-Final states (In Progress / Postponed / etc.), and W / L /
// SV decisions on a single wrap-friendly line below.
//
// Team identity reads as the canonical nickname ("Tigers", "Yankees",
// "Red Sox") via the teamNickname helper. Earlier passes had the
// 2-3 letter abbreviation here (DET, NYY), which read as a chrome
// element more than a team — the full nickname makes the card more
// scannable and gives away/home rows the visual weight they should
// carry on the homepage strip.

interface GameCardProps {
  game: MlbGameResult;
}

export function GameCard({ game }: GameCardProps) {
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
      className="block rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 hover:border-white/20 transition-colors px-3.5 py-3 space-y-2"
    >
      {/* Each team row uses gap-2.5 (logo→name) + space-y-2 between
          rows so the larger 28px logos breathe rather than stacking
          edge-to-edge. */}
      <div className="space-y-2">
        <TeamScoreRow
          teamId={game.away.teamId}
          score={hasScores ? awayScore : null}
          won={awayWon}
          statusChip={showStatusNote ? game.status.detailedState : null}
        />
        <TeamScoreRow
          teamId={game.home.teamId}
          score={hasScores ? homeScore : null}
          won={homeWon}
        />
      </div>
      {hasDecisions ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10.5px] tabular-nums pt-2 border-t border-white/[0.06]">
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
  score,
  won,
  statusChip,
}: {
  teamId: number;
  score: number | null;
  won: boolean;
  statusChip?: string | null;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <TeamLogo teamId={teamId} size={28} />
      <span
        className={
          "text-[14px] flex-1 truncate " +
          (won ? "text-white font-semibold" : "text-white/75")
        }
      >
        {teamNickname(teamId)}
      </span>
      {statusChip ? (
        <span className="text-[9px] uppercase tracking-[0.12em] text-white/40">
          {statusChip}
        </span>
      ) : null}
      <span
        className={
          "text-[16px] tabular-nums w-6 text-right " +
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
