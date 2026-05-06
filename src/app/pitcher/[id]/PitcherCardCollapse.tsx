"use client";

import { useState, type ReactNode } from "react";

// Mobile: collapses everything below the season picker behind a
// chevron toggle so the card stops eating the whole screen. Desktop
// (sm+): always expanded — the chevron is hidden, body is shown
// inline.
export function PitcherCardCollapse({
  header,
  body,
}: {
  header: ReactNode;
  body: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative space-y-4">
      <div className="space-y-4 pr-12 sm:pr-0">{header}</div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Hide filters" : "Show filters"}
        className="sm:hidden absolute top-0 right-0 w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 flex items-center justify-center text-white/80 transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div className={`${open ? "block" : "hidden"} sm:block space-y-4`}>
        {body}
      </div>
    </div>
  );
}
