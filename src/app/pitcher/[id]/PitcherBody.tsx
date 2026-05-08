"use client";

import type { ReactNode } from "react";
import { usePitcherView } from "./StatsModeToggle";

// Composes the pitcher card body from three slots:
//   - arsenal: aggregate pitch-usage list (only meaningful when the
//     3D scene is mounted)
//   - filters: hand / pitch-type / outcome / game filter rows (apply
//     in both modes — they shape the data the analytics read too)
//   - matchups: pitcher-vs-batter matchups panel (only meaningful in
//     arsenal mode where AB picks land in 3D playback)
//
// In stats mode only the filters render. The arsenal aggregate would
// duplicate the per-pitch table that leads the stats grid, and the
// matchups panel doesn't apply to season-aggregate analytics.
export function PitcherBody({
  arsenal,
  filters,
  matchups,
}: {
  arsenal: ReactNode;
  filters: ReactNode;
  matchups: ReactNode;
}) {
  const [view] = usePitcherView();
  if (view === "stats") return <>{filters}</>;
  return (
    <>
      {arsenal}
      {filters}
      {matchups}
    </>
  );
}
