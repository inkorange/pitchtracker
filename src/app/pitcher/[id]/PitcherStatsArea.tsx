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
      // Mobile: dock under the (now-expanded) pitcher card. The card
      // shows header + season picker + toggle + filters in stats
      // mode; ~25rem covers all of that with a small gap.
      // Desktop: jump to the right of the pitcher card. top-28 keeps
      // the cards clear of the "Search another pitcher" input that's
      // pinned at top-14 right-6.
      className="absolute top-[25rem] left-3 right-3 bottom-3 sm:top-28 sm:left-[23.5rem] sm:right-6 sm:bottom-6 z-10 overflow-y-auto pointer-events-auto pb-4"
      aria-label="Pitcher stats"
    >
      <PitcherStatsView />
    </section>
  );
}
