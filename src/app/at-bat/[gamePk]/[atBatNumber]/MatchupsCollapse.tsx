"use client";

import { useState, type ReactNode } from "react";

// Inline collapse for the in-game matchups list. Active on both
// mobile AND desktop (unlike the chrome-wide MobileCollapse, which
// stays open at sm+) — the matchup list can grow to a dozen rows on
// long pitching outings, so we want users on every viewport to be
// able to fold it away. Default open since the user opted into the
// at-bat replay context.
//
// Pure CSS animation via the grid-template-rows 0fr → 1fr trick:
// no fixed height, no resize watcher, just a 250ms tween that
// always knows the body's natural height.
export function MatchupsCollapse({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pt-3 border-t border-white/[0.05] space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white transition-colors"
      >
        <span>Matchups this game</span>
        <span className="flex items-center gap-1.5 tabular-nums text-white/35">
          {count}
          <svg
            width={10}
            height={10}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-[250ms] ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-[250ms] ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden min-h-0">{children}</div>
      </div>
    </div>
  );
}
