"use client";

import { PitcherFilters } from "@/components/filters/PitcherFilters";
import { usePitcherView } from "./StatsModeToggle";

// Thin client wrapper: reads ?view and forwards the right `mode` to
// PitcherFilters so the Pitch-type and Outcome rows hide in Stats
// mode (they defeat the analytics).
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

export function PitcherFiltersWrapper(props: {
  arsenal: ArsenalEntry[];
  games: GameEntry[];
  season: number;
}) {
  const [view] = usePitcherView();
  return <PitcherFilters {...props} mode={view} />;
}
