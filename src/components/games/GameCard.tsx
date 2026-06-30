import Link from "next/link";
import type { MlbGameResult } from "@/lib/statsapi/client";
import { TeamLogo } from "@/components/team/TeamLogo";
import { teamNickname } from "@/lib/teams/nicknames";
import { pitcherPagePath } from "@/lib/url/pitcher-slug";

// Shared game-result card used by:
//   - the homepage YesterdayGamesStrip
//   - the /at-bat date listing
//
// The team rows are a click target that opens the at-bat browser
// (/at-bat/<gamePk>). Each W / L / SV pitcher name in the decisions
// row below is its own link to that pitcher's page — clicking the
// pitcher name does NOT bounce through the matchup. Anchor tags
// can't nest in valid HTML, so the outer wrapper is a plain styled
// container with two independent click targets inside.
//
// Team identity reads as the canonical nickname ("Tigers", "Yankees",
// "Red Sox") via the teamNickname helper.

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
    <div className="rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 hover:border-white/20 transition-colors px-3.5 py-3 space-y-2.5">
      {/* Team rows are the game-link click target. space-y-2 keeps
          the two 28px team-logo rows from stacking edge-to-edge. */}
      <Link href={`/at-bat/${game.gamePk}`} className="block space-y-2">
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
      </Link>
      {hasDecisions ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] tabular-nums pt-2.5 border-t border-white/[0.06]">
          {game.decisions.winner ? (
            <DecisionLink
              color="text-emerald-300/90"
              tag="W"
              id={game.decisions.winner.id}
              name={game.decisions.winner.fullName}
            />
          ) : null}
          {game.decisions.loser ? (
            <DecisionLink
              color="text-red-300/90"
              tag="L"
              id={game.decisions.loser.id}
              name={game.decisions.loser.fullName}
            />
          ) : null}
          {game.decisions.save ? (
            <DecisionLink
              color="text-amber-300/90"
              tag="SV"
              id={game.decisions.save.id}
              name={game.decisions.save.fullName}
            />
          ) : null}
        </div>
      ) : null}
    </div>
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

function DecisionLink({
  color,
  tag,
  id,
  name,
}: {
  color: string;
  tag: string;
  id: number;
  name: string;
}) {
  return (
    <Link
      href={pitcherPagePath(id, name)}
      className="inline-flex items-baseline gap-1 hover:underline underline-offset-2 decoration-white/30"
    >
      <span className={`${color} font-semibold uppercase tracking-[0.08em]`}>
        {tag}
      </span>
      <span className="text-white/85 hover:text-white transition-colors">
        {shortenName(name)}
      </span>
    </Link>
  );
}

// "Garrett Crochet" → "G. Crochet". Keeps the decisions row narrow
// enough to fit three columns of cards on desktop without truncating.
function shortenName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}
