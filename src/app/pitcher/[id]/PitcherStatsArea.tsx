"use client";

import { usePitcherView } from "./StatsModeToggle";
import { PitcherStatsView } from "./PitcherStatsView";

// Positions the analytics view OUTSIDE the pitcher card so it can
// take the full main area without being trapped by the card's narrow
// column. Renders nothing in arsenal mode.
//
// Mobile: anchored just below the pitcher card's collapsed height
// (top-[14rem]). When the user expands the pitcher card, it grows
// down with z-20 and overlays the stats area (z-10) — collapse to
// read the cards, expand to use the filters. Standard MobileCollapse
// stacking, just like arsenal mode.
//
// Desktop (lg+): jumps to the right of the pitcher card and fills
// the remaining viewport.
export function PitcherStatsArea() {
  const [view] = usePitcherView();
  if (view !== "stats") return null;
  return (
    <section
      className="absolute top-[14rem] left-3 right-3 bottom-3 sm:top-28 sm:left-[23.5rem] sm:right-6 sm:bottom-6 z-10 overflow-y-auto pointer-events-auto pb-4"
      aria-label="Pitcher stats"
    >
      <PitcherStatsView />
    </section>
  );
}
