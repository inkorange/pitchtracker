"use client";

import { useState } from "react";
import {
  OUTCOME_COLORS,
  OUTCOME_LABELS,
  type OutcomeCategory,
} from "@/lib/viz/colors";

const ITEMS: OutcomeCategory[] = ["whiff", "called", "ball", "foul", "inplay"];

// Outcome legend pinned to the bottom-left of the viewport.
// Desktop (sm+): always-expanded panel, same look as the rest of the
// dark glass UI.
// Mobile: a compact "Outcome Legend ↑" chip sits at the bottom; tap it
// to expand the panel upwards. Anchoring to bottom-6 lets the panel
// grow up from the chip without colliding with the CameraPad on the
// right side of the screen.
//
// Default `className` works for the at-bat replay page; the pitcher
// view's inline at-bat playback overrides it (its mobile playback bar
// already lives at bottom-20).
export function AtBatOutcomeLegend({
  className = "absolute bottom-44 sm:bottom-6 left-3 sm:left-6 z-20 flex flex-col items-start gap-2 pointer-events-auto",
}: {
  className?: string;
} = {}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={className}>
      {/* Items panel — always visible on desktop, mobile only when expanded. */}
      <div
        className={`${expanded ? "block" : "hidden"} sm:block rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg p-3 w-fit`}
      >
        <div className="hidden sm:block text-[10px] uppercase tracking-[0.14em] text-white/70 mb-1.5">
          Outcome
        </div>
        <ul className="flex flex-col gap-1.5">
          {ITEMS.map((cat) => (
            <li
              key={cat}
              className="flex items-center gap-1.5 text-[11px] text-white/85"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: OUTCOME_COLORS[cat] }}
              />
              <span>{OUTCOME_LABELS[cat]}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Toggle chip — mobile only. Tapping flips `expanded` so the
          panel above shows/hides. The arrow flips direction so it's
          obvious the panel grows upward. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="sm:hidden inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg text-[10px] uppercase tracking-[0.12em] text-white/85"
        aria-expanded={expanded}
      >
        <span>Outcome Legend</span>
        <span aria-hidden>{expanded ? "↓" : "↑"}</span>
      </button>
    </div>
  );
}
