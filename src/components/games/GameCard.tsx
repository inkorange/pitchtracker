import Link from "next/link";
import type { MlbGameResult } from "@/lib/statsapi/client";
import Image from "next/image";
import { teamLogoOnDarkUrl } from "@/lib/viz/headshot";
import { teamNickname } from "@/lib/teams/nicknames";
import { pitcherPagePath } from "@/lib/url/pitcher-slug";

// Shared game-result card used by:
//   - (formerly) the homepage YesterdayGamesStrip, removed in the redesign
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
  const hasDecisions =
    game.decisions.winner || game.decisions.loser || game.decisions.save;

  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const [, m, d] = game.officialDate.split("-").map(Number);
  const dateLabel = m && d ? `${MONTHS[m - 1]} ${d}` : game.officialDate;
  const statusLabel = game.status.detailedState || game.status.abstractGameState;

  return (
    <div className="flex flex-col gap-2.5 px-[18px] py-4 bg-surface border border-line rounded-control hover:border-line-strong transition-colors">
      <span className="label-caps">
        {statusLabel} · {dateLabel}
      </span>
      {/* Team rows are the game-link click target. */}
      <Link href={`/at-bat/${game.gamePk}`} className="flex flex-col gap-1.5 text-ink hover:text-ink">
        <TeamScoreRow teamId={game.away.teamId} score={hasScores ? awayScore : null} won={awayWon} />
        <TeamScoreRow teamId={game.home.teamId} score={hasScores ? homeScore : null} won={homeWon} />
      </Link>
      {hasDecisions ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] num pt-2.5 border-t border-line">
          {game.decisions.winner ? (
            <DecisionLink color="text-[#22c55e]" tag="W" id={game.decisions.winner.id} name={game.decisions.winner.fullName} />
          ) : null}
          {game.decisions.loser ? (
            <DecisionLink color="text-accent-hover" tag="L" id={game.decisions.loser.id} name={game.decisions.loser.fullName} />
          ) : null}
          {game.decisions.save ? (
            <DecisionLink color="text-highlight" tag="SV" id={game.decisions.save.id} name={game.decisions.save.fullName} />
          ) : null}
        </div>
      ) : null}
      <Link href={`/at-bat/${game.gamePk}`} className="text-[13px] font-semibold text-accent-hover hover:text-ink">
        Pick an at-bat →
      </Link>
    </div>
  );
}

function TeamScoreRow({ teamId, score, won }: { teamId: number; score: number | null; won: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative size-7 shrink-0">
        <Image src={teamLogoOnDarkUrl(teamId)} alt="" fill sizes="28px" className="object-contain" unoptimized />
      </span>
      <span
        className={`flex-1 truncate font-display font-bold text-[22px] leading-tight uppercase ${won ? "text-ink" : "text-ink-2"}`}
      >
        {teamNickname(teamId)}
      </span>
      <span className={`font-display font-bold text-[24px] num w-8 text-right ${won ? "text-ink" : "text-muted"}`}>
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
      className="inline-flex items-baseline gap-1 text-ink-2 hover:text-ink hover:underline underline-offset-2"
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
