"use client";

import type { ReactNode } from "react";
import { usePitcherView } from "./StatsModeToggle";

// Renders the pitcher card body for Arsenal mode only. In Stats mode
// the body is empty — the analytics cards live OUTSIDE the pitcher
// card (see PitcherStatsArea), so the card stays compact and the
// stats can take over the main area on the left of the screen
// (desktop) or stack below the card (mobile).
export function PitcherBody({ arsenal }: { arsenal: ReactNode }) {
  const [view] = usePitcherView();
  if (view === "stats") return null;
  return <>{arsenal}</>;
}
