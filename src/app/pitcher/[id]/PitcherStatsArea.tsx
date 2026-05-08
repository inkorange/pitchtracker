"use client";

import { usePitcherView } from "./StatsModeToggle";
import { PitcherStatsView } from "./PitcherStatsView";

// Positions the analytics view OUTSIDE the pitcher card so it can
// take the full main area without being trapped by the card's narrow
// column. Renders nothing in arsenal mode.
//
// Mobile: docks below the (compact, body-collapsed) pitcher card and
// scrolls within its own container. Anchored at top-[14.5rem] so the
// pitcher header + season picker + view toggle have room above.
// Desktop (sm+): jumps to the right of the pitcher card, fills the
// remaining viewport, and renders its own internal 2-col grid via
// PitcherStatsView's responsive layout.
export function PitcherStatsArea() {
  const [view] = usePitcherView();
  if (view !== "stats") return null;
  return (
    <section
      className="absolute top-[17.5rem] left-3 right-3 bottom-3 sm:top-16 sm:left-[23.5rem] sm:right-6 sm:bottom-6 z-10 overflow-y-auto pointer-events-auto pb-4"
      aria-label="Pitcher stats"
    >
      <PitcherStatsView />
    </section>
  );
}
