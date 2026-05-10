"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

const MOBILE_MQL = "(max-width: 639px)";
function subscribeIsMobile(callback: () => void): () => void {
  const mql = window.matchMedia(MOBILE_MQL);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function getIsMobileSnapshot(): boolean {
  return window.matchMedia(MOBILE_MQL).matches;
}
function getIsMobileServerSnapshot(): boolean {
  return false;
}

// Inline collapse for the in-game matchups list. Active on both
// mobile AND desktop (unlike the chrome-wide MobileCollapse, which
// stays open at sm+) — the matchup list can grow to a dozen rows on
// long pitching outings, so we want users on every viewport to be
// able to fold it away.
//
// Defaults open on desktop, closed on mobile — the at-bat page
// remounts this component on every [atBatNumber] route change, so
// "default closed on mobile" doubles as the auto-collapse-after-pick
// behavior the user asked for: tap a row, navigate, the new mount
// starts collapsed; user can re-expand to pick another.
//
// Pure CSS animation via the grid-template-rows 0fr → 1fr trick.
export function MatchupsCollapse({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const isMobile = useSyncExternalStore(
    subscribeIsMobile,
    getIsMobileSnapshot,
    getIsMobileServerSnapshot,
  );
  // First-render comparator — sets the closed-by-default state once
  // on mount when the viewport is mobile. The flag prevents the
  // user's manual toggle from being overwritten on subsequent
  // resizes.
  const [appliedMobileDefault, setAppliedMobileDefault] = useState(false);
  if (!appliedMobileDefault) {
    setAppliedMobileDefault(true);
    if (isMobile) setOpen(false);
  }
  return (
    <div className="pt-3 border-t border-white/[0.05] flex-1 min-h-0 flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex-shrink-0 w-full flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white transition-colors cursor-pointer"
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
        className="grid flex-1 min-h-0 mt-2 transition-[grid-template-rows] duration-[250ms] ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-y-auto min-h-0">{children}</div>
      </div>
    </div>
  );
}
