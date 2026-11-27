import Image from "next/image";
import Link from "next/link";
import type { RankingBoard } from "@/lib/home/rankings";
import { pitcherHeadshotUrl } from "@/lib/viz/headshot";
import { MetricInfo } from "./MetricInfo";

export function LeaderboardCard({
  board,
  id,
  labelledBy,
  role,
}: {
  board: RankingBoard;
  /** Set when the card is a tabpanel (mobile). */
  id?: string;
  labelledBy?: string;
  role?: "tabpanel";
}) {
  const { category, rows } = board;
  return (
    <article
      id={id}
      role={role}
      aria-labelledby={labelledBy}
      className="bg-surface border border-line rounded-control overflow-hidden"
    >
      <header className="flex items-center justify-between gap-3 px-[18px] py-3.5 bg-surface-2 border-b border-line">
        <div className="flex flex-col min-w-0">
          <h3 className="m-0 font-display font-bold text-[22px] leading-tight tracking-[0.5px] uppercase text-ink">
            {category.title}
          </h3>
          <span className="label-caps">{category.sub}</span>
        </div>
        <MetricInfo label={category.title} description={category.info} />
      </header>
      <ol className="list-none m-0 py-1.5">
        {rows.map((r) => (
          <li key={r.pitcherId}>
            <Link
              href={r.href}
              className="flex items-center gap-3 px-[18px] py-[9px] min-h-11 hover:bg-surface-2 text-ink hover:text-ink transition-colors"
            >
              <span className="w-4 shrink-0 font-display font-bold text-lg text-muted num">
                {r.rank}
              </span>
              <span className="relative size-[30px] shrink-0 rounded-full bg-avatar overflow-hidden">
                <Image
                  src={pitcherHeadshotUrl(r.pitcherId, 64)}
                  alt=""
                  fill
                  sizes="30px"
                  className="object-cover"
                  unoptimized
                />
              </span>
              <span className="grow min-w-0 truncate text-[15px] font-medium">{r.name}</span>
              <span className="font-display font-bold text-[22px] num shrink-0">
                {r.value}
                <span className="text-sm text-muted ml-[3px]">{category.unit}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </article>
  );
}
