"use client";

import { usePitcherView } from "./StatsModeToggle";
import { PitcherStatsView } from "./PitcherStatsView";

interface ArsenalEntry {
  pitch_type: string;
  pitch_count: number | null;
}
interface GameEntry {
  game_pk: number;
  game_date: string;
  away: string;
  home: string;
}

// Positions the analytics view OUTSIDE the pitcher card so it can
// take the full main area without being trapped by the card's narrow
// column. Renders nothing in arsenal mode.
//
// In stats mode the pitcher card body is empty (PitcherBody returns
// null), so the card stays a compact header — predictable height
// means no overlap with the cards below on mobile, and the user can
// still collapse it freely. The filters render here, at the top of
// the analytics stack: they belong with the stats anyway.
//
// Mobile: docks just below the compact pitcher card with its own
// scroll context.
// Desktop (lg+): jumps to the right of the pitcher card, fills the
// remaining viewport.
export function PitcherStatsArea({
  arsenal,
  games,
  season,
}: {
  arsenal: ArsenalEntry[];
  games: GameEntry[];
  season: number;
}) {
  const [view] = usePitcherView();
  if (view !== "stats") return null;
  return (
    <section
      className="absolute top-[12.5rem] left-3 right-3 bottom-3 sm:top-28 sm:left-[23.5rem] sm:right-6 sm:bottom-6 z-10 overflow-y-auto pointer-events-auto pb-4"
      aria-label="Pitcher stats"
    >
      <PitcherStatsView arsenal={arsenal} games={games} season={season} />
    </section>
  );
}
