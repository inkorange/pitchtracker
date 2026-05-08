"use client";

import type { ReactNode } from "react";
import { usePitcherView } from "./StatsModeToggle";
import { PitcherStatsView } from "./PitcherStatsView";

// Swaps the pitcher card body between Arsenal mode (the existing
// filters + matchups composition rendered server-side and passed in)
// and Stats mode (the analytics view that fetches client-side).
//
// Server renders only the arsenal markup; PitcherStatsView's tree
// mounts only when ?view=stats. Keeping it client-side means the
// stats fetch + chart mount happen on demand without duplicating
// arsenal data into the initial HTML.
export function PitcherBody({ arsenal }: { arsenal: ReactNode }) {
  const [view] = usePitcherView();
  if (view === "stats") {
    return <PitcherStatsView />;
  }
  return <>{arsenal}</>;
}
