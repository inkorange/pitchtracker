"use client";

import { parseAsInteger, useQueryStates } from "nuqs";
import { AtBatOutcomeLegend } from "@/app/at-bat/[gamePk]/[atBatNumber]/AtBatOutcomeLegend";

// Wraps AtBatOutcomeLegend so it only appears on the pitcher view
// while playback is active (?abGame + ?abNum set), and positions it
// above the inline playback bar on mobile so the two don't collide.
//
// Mobile: bottom-44 leaves room for the playback transport bar that
// sits at bottom-20 with a ~96px content height.
// Desktop: bottom-6 / left-6 — same anchor the at-bat replay page uses.
export function PitcherOutcomeLegend() {
  const [{ abGame, abNum }] = useQueryStates({
    abGame: parseAsInteger,
    abNum: parseAsInteger,
  });
  const inAtBatMode = abGame != null && abNum != null;
  if (!inAtBatMode) return null;
  return (
    <AtBatOutcomeLegend className="absolute bottom-44 sm:bottom-6 left-3 sm:left-6 z-20 flex flex-col items-start gap-2 pointer-events-auto" />
  );
}
