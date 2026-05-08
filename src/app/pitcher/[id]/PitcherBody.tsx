"use client";

import type { ReactNode } from "react";
import { usePitcherView } from "./StatsModeToggle";

// Renders the pitcher card body in arsenal mode only. In stats mode
// the body is empty — the analytics view (PitcherStatsArea) renders
// its own integrated filter row at the top, so the pitcher card
// stays compact and predictable on mobile.
export function PitcherBody({ arsenal }: { arsenal: ReactNode }) {
  const [view] = usePitcherView();
  if (view === "stats") return null;
  return <>{arsenal}</>;
}
