"use client";

import {
  parseAsInteger,
  parseAsStringEnum,
  useQueryState,
  useQueryStates,
} from "nuqs";

// Segmented control in the pitcher card header that flips the page
// between the 3D arsenal view (default) and the Stats analytics view.
// URL-backed via ?view=arsenal|stats so the choice survives refresh
// and is shareable.
//
// In at-bat playback (?abGame + ?abNum set) the toggle is hidden — the
// page is dedicated to the 3D playback in that mode and stats would
// be a context switch.

export type PitcherView = "arsenal" | "stats";

export const VIEW_PARSER = parseAsStringEnum(["arsenal", "stats"] as const)
  .withDefault("arsenal");

export function usePitcherView() {
  return useQueryState("view", VIEW_PARSER);
}

export function StatsModeToggle() {
  const [view, setView] = usePitcherView();
  const [{ abGame, abNum }] = useQueryStates({
    abGame: parseAsInteger,
    abNum: parseAsInteger,
  });
  const inAtBatMode = abGame != null && abNum != null;
  if (inAtBatMode) return null;
  return (
    <div className="inline-flex rounded-full bg-white/[0.04] border border-white/10 p-0.5 text-[10px] uppercase tracking-[0.14em]">
      <button
        type="button"
        onClick={() => setView("arsenal")}
        aria-pressed={view === "arsenal"}
        className={
          "px-3 py-1 rounded-full transition-colors " +
          (view === "arsenal"
            ? "bg-white/[0.14] text-white"
            : "text-white/55 hover:text-white")
        }
      >
        Arsenal
      </button>
      <button
        type="button"
        onClick={() => setView("stats")}
        aria-pressed={view === "stats"}
        className={
          "px-3 py-1 rounded-full transition-colors " +
          (view === "stats"
            ? "bg-white/[0.14] text-white"
            : "text-white/55 hover:text-white")
        }
      >
        Stats
      </button>
    </div>
  );
}
