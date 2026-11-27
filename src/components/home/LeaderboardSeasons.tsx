"use client";

import { useState } from "react";
import type { RankingBoard } from "@/lib/home/rankings";
import { LeaderboardCard } from "./LeaderboardCard";
import { LeaderboardTabs } from "./LeaderboardTabs";
import { SectionHeader } from "./SectionHeader";

export interface SeasonBoards {
  season: number;
  boards: RankingBoard[];
  /** Explains a reduced board set (past seasons). */
  note: string | null;
}

export function LeaderboardSeasons({ seasons }: { seasons: SeasonBoards[] }) {
  const [idx, setIdx] = useState(0);
  const cur = seasons[idx];
  const isCurrent = idx === 0;

  return (
    <section className="container-page py-8 md:pt-10 md:pb-[72px]" aria-labelledby="leaders-h">
      <SectionHeader
        id="leaders-h"
        title={
          <>
            Leaderboards{" "}
            <span className="hidden md:inline text-muted font-semibold text-xl">
              · {cur.season} {isCurrent ? "regular season" : "season"}
            </span>
          </>
        }
        aside={
          seasons.length > 1 ? (
            <label className="flex items-center gap-2">
              <span className="sr-only">Leaderboard season</span>
              <select
                value={idx}
                onChange={(e) => setIdx(Number(e.target.value))}
                className="select-chevron h-11 md:h-10 pl-3 rounded-control border border-line-strong bg-surface text-ink text-sm font-semibold num"
              >
                {seasons.map((s, i) => (
                  <option key={s.season} value={i}>
                    {s.season} season
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="md:hidden text-[13px] text-muted">{cur.season} season</span>
          )
        }
      />

      <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-4" aria-live="polite">
        {cur.boards.map((b) => (
          <LeaderboardCard key={`${cur.season}-${b.category.key}`} board={b} />
        ))}
      </div>

      <div className="md:hidden -mx-5">
        {/* Remount per season so the selected tab resets. */}
        <LeaderboardTabs key={cur.season} boards={cur.boards} />
      </div>

      {cur.note ? <p className="m-0 mt-4 text-xs text-muted max-w-3xl">{cur.note}</p> : null}
    </section>
  );
}
