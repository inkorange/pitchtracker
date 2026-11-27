"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { RankingBoard } from "@/lib/home/rankings";
import { LeaderboardCard } from "./LeaderboardCard";

// Mobile leaderboards: scrollable pill tablist, one board at a time.
// Follows the WAI-ARIA tabs pattern (roving tabindex, ←/→/Home/End).
export function LeaderboardTabs({ boards }: { boards: RankingBoard[] }) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (i: number) => {
    const next = (i + boards.length) % boards.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") select(active + 1);
    else if (e.key === "ArrowLeft") select(active - 1);
    else if (e.key === "Home") select(0);
    else if (e.key === "End") select(boards.length - 1);
    else return;
    e.preventDefault();
  };

  const board = boards[active];
  return (
    <div className="flex flex-col gap-3.5">
      <div
        role="tablist"
        aria-label="Leaderboard stat"
        onKeyDown={onKeyDown}
        className="flex gap-2 px-5 overflow-x-auto scrollbar-thin"
      >
        {boards.map((b, i) => {
          const selected = i === active;
          return (
            <button
              key={b.category.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`lb-tab-${b.category.key}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`lb-panel-${b.category.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={`shrink-0 h-11 px-4 rounded-full text-sm font-semibold whitespace-nowrap border transition-colors ${
                selected
                  ? "bg-ink text-bg border-ink"
                  : "bg-transparent text-ink-2 border-line-strong hover:text-ink"
              }`}
            >
              {b.category.tab}
            </button>
          );
        })}
      </div>
      <div className="px-5">
        <LeaderboardCard
          board={board}
          role="tabpanel"
          id={`lb-panel-${board.category.key}`}
          labelledBy={`lb-tab-${board.category.key}`}
        />
      </div>
    </div>
  );
}
