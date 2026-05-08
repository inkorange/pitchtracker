"use client";

import type { ReactNode } from "react";
import { usePitcherView } from "./StatsModeToggle";

// Hides the always-on desktop OutcomeLegend when the page is in
// Stats mode. The outcome categories are about pitch results in 3D
// playback / arsenal coloring; they don't apply when the user is
// reading aggregate analytics.
export function PitcherOutcomeLegendGate({ children }: { children: ReactNode }) {
  const [view] = usePitcherView();
  if (view === "stats") return null;
  return <>{children}</>;
}
