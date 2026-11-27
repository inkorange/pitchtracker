"use client";

import { usePitcherView } from "./StatsModeToggle";
import { PitcherStatsView } from "./PitcherStatsView";
import type { StatsAtBat, StatsGame } from "./stats/StatsSummary";

// Stats analytics view (?view=stats) — sibling of the pitcher chrome.
// Renders nothing in the 3D view.
export function PitcherStatsArea({
  filterSummary,
  game,
  atBats,
  season,
  hasPostseason,
}: {
  /** Server-rendered scope text passed through to the stats banner
   *  so it mirrors the TopNav title. */
  filterSummary: string;
  game: StatsGame | null;
  atBats: StatsAtBat[] | null;
  season: number;
  hasPostseason: boolean;
}) {
  const [view] = usePitcherView();
  if (view !== "stats") return null;

  return (
    <section
      // Below lg: a full-height scrolling page under the chip row (the
      // drawer is dismissed in this view; design/StatsMobile.dc.html).
      // lg+: right of the rail.
      className="absolute left-3 right-3 top-[116px] bottom-0 lg:top-[124px] lg:left-[calc(384px+24px)] lg:right-6 lg:bottom-6 z-10 overflow-y-auto pointer-events-auto pt-1 pb-4"
      aria-label="Pitcher stats"
    >
      <PitcherStatsView filterSummary={filterSummary} game={game} atBats={atBats} season={season} hasPostseason={hasPostseason} />
    </section>
  );
}
