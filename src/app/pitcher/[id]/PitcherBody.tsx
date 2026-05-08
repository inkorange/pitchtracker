"use client";

import type { ReactNode } from "react";
import { usePitcherView } from "./StatsModeToggle";

// Composes the pitcher card body from three slots:
//   - filters: hand + game filters (always shown; the wrapper toggles
//     pitch-type / outcome rows on/off based on view)
//   - arsenal: aggregate pitch-usage list + render count + empty
//     state — only relevant when the 3D scene is mounted
//   - matchups: pitcher-vs-batter matchups panel — only meaningful
//     when browsing the arsenal, not when reading aggregate analytics
//
// In stats mode only the filters render. The arsenal aggregate row
// would duplicate the per-pitch table that leads the stats grid
// anyway, and the matchups panel doesn't apply to season-aggregate
// analytics.
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
  if (view === "stats") {
    return <>{filters}</>;
  }
  return (
    <>
      {arsenal}
      {filters}
      {matchups}
    </>
  );
}
