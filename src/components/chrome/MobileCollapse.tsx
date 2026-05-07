"use client";

import { useState, type ReactNode } from "react";

// Mobile: collapses `body` behind a chevron toggle so dense panels
// (pitcher cards, tunneling stats, etc.) don't eat the whole screen.
// Desktop (sm+): always expanded — chevron hidden, body shown inline.
//
// Two sizes:
//   "default" — 36×36 button + 14×14 chevron, fits the pitcher card
//      header where the toggle is the primary chrome.
//   "compact" — 24×24 button + 10×10 chevron, sized for inline section
//      headers (tunneling, shared filters) where the toggle should
//      defer to the surrounding type.
export function MobileCollapse({
  header,
  body,
  ariaLabel = "Toggle details",
  size = "default",
}: {
  header: ReactNode;
  body: ReactNode;
  ariaLabel?: string;
  size?: "default" | "compact";
}) {
  const [open, setOpen] = useState(false);
  const compact = size === "compact";
  // Compact and default share the same chevron size (matching the
  // pitcher-card arrows). Compact only differs in the lighter
  // bg/border so the toggle defers to the surrounding text.
  const buttonClass = compact
    ? "w-9 h-9 rounded-full bg-white/[0.04] hover:bg-white/[0.12] border border-white/10"
    : "w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/15";
  const svgSize = 14;
  const headerPad = "pr-12 sm:pr-0";
  return (
    <div className="relative space-y-3">
      <div className={`space-y-3 ${headerPad}`}>{header}</div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`sm:hidden absolute top-0 right-0 flex items-center justify-center text-white/80 transition-colors ${buttonClass}`}
      >
        <svg
          width={svgSize}
          height={svgSize}
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
      <div className={`${open ? "block" : "hidden"} sm:block space-y-3`}>
        {body}
      </div>
    </div>
  );
}
