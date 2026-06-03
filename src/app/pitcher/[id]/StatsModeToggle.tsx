"use client";

import { parseAsStringEnum, useQueryState } from "nuqs";

// Segmented control in the pitcher card header that flips the page
// between the 3D arsenal view (default) and the Stats analytics view.
// URL-backed via ?view=arsenal|stats so the choice survives refresh
// and is shareable.
//
// The toggle stays visible even in at-bat playback (?abGame + ?abNum)
// because the stats view is contextually useful there — the
// Sequencing card narrows to the selected batter, so an analyst
// watching a replay can flip over to see "what's his season pattern
// vs this hitter?" without losing their place.

export type PitcherView = "arsenal" | "stats";

export const VIEW_PARSER = parseAsStringEnum(["arsenal", "stats"] as const)
  .withDefault("arsenal");

export function usePitcherView() {
  return useQueryState("view", VIEW_PARSER);
}

export function StatsModeToggle() {
  const [view, setView] = usePitcherView();
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
