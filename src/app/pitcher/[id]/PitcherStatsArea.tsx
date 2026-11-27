"use client";

import { usePitcherView } from "./StatsModeToggle";
import { PitcherStatsView } from "./PitcherStatsView";

// Stats analytics view (?view=stats) — sibling of the pitcher chrome.
// Renders nothing in the 3D view.
export function PitcherStatsArea({
  filterSummary,
}: {
  /** Server-rendered scope text passed through to the stats banner
   *  so it mirrors the TopNav title. */
  filterSummary: string;
}) {
  const [view] = usePitcherView();
  if (view !== "stats") return null;

  return (
    <section
      // Below lg: between the chip row and the drawer's peek (Phase 9
      // moves stats into the drawer). lg+: right of the rail.
      className="absolute left-3 right-3 top-[116px] bottom-[260px] lg:top-[124px] lg:left-[calc(384px+24px)] lg:right-6 lg:bottom-6 z-10 overflow-y-auto pointer-events-auto pt-1 pb-4"
      aria-label="Pitcher stats"
    >
      <PitcherStatsView filterSummary={filterSummary} />
    </section>
  );
}
