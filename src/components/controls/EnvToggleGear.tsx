"use client";

import { useEffect, useRef, useState } from "react";
import {
  setEnvToggle,
  useEnvToggles,
  type EnvToggles,
} from "@/lib/env-toggles-store";

// Ordered list of toggle rows shown in the popover. Add a new
// EnvToggles key here to expose it in the UI.
const ROWS: Array<{ key: keyof EnvToggles; label: string; hint: string }> = [
  {
    key: "field",
    label: "Field",
    hint: "Grass, dirt, bases, mound, foul lines (keeps plate)",
  },
  {
    key: "batter",
    label: "Batter",
    hint: "Silhouette in the box",
  },
  {
    key: "shadows",
    label: "Shadows",
    hint: "Directional sun + cast shadow on the ground",
  },
  // Stadium sits at the bottom as the opt-in add-on — off by default.
  {
    key: "stadium",
    label: "Stadium",
    hint: "Bowl, upper decks, crowd, walls",
  },
];

// Chip container class — matched to CameraPad so the two controls
// read as a matched pair sitting side-by-side.
const CHIP =
  "flex items-center gap-1 p-1 rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg";

export function EnvToggleGear() {
  const toggles = useEnvToggles();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Click-outside dismissal: swallows outside pointerdowns while the
  // popover is open, so the user can dismiss by clicking anywhere in
  // the scene (or the CameraPad chip) instead of hunting for a close
  // button. Skips when closed to avoid the listener cost.
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => {
      window.removeEventListener("mousedown", handler);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <div className={CHIP}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Environment toggles"
          aria-expanded={open}
          className={`px-2 py-1.5 rounded-md transition-colors ${
            open
              ? "bg-white/10 text-white"
              : "text-white/55 hover:text-white hover:bg-white/[0.04]"
          }`}
        >
          <GearIcon />
        </button>
      </div>
      {open ? (
        <div
          role="menu"
          // Popover anchoring: on desktop (≥sm) it extends LEFT of the
          // gear (right-0 aligns the popover's right edge to the
          // gear's right edge) so it sits inside the viewport with
          // room to spare on the left. On mobile the gear is the
          // LEFTMOST chip in the CameraPad row so extending left
          // would run the popover off the screen's left edge — flip
          // to left-0 so it extends RIGHT instead, staying on screen
          // (overlapping the preset chip behind is fine because
          // that's what the user is interacting away from).
          // z-50 puts the popover above every other scene chrome
          // element (transport bar, pitch chips, follow-off button,
          // etc. — all around z-20/z-30). Without this the popover
          // slots behind them and rows get partially obscured on
          // mobile where the controls stack tightly.
          className="absolute bottom-full left-0 sm:left-auto sm:right-0 mb-2 w-56 rounded-lg bg-[#081a32]/95 backdrop-blur-md border border-white/10 shadow-xl p-1 z-50"
        >
          {ROWS.map((row) => {
            const value = toggles[row.key];
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => setEnvToggle(row.key, !value)}
                role="menuitemcheckbox"
                aria-checked={value}
                className="w-full flex items-start gap-2 px-2 py-2 text-left rounded-md hover:bg-white/[0.06] transition-colors"
              >
                <span
                  aria-hidden
                  className={`mt-0.5 shrink-0 h-4 w-7 rounded-full transition-colors relative ${
                    value ? "bg-emerald-500/80" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
                      value ? "left-3.5" : "left-0.5"
                    }`}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-[0.14em] text-white">
                    {row.label}
                  </span>
                  <span className="block text-[10px] text-white/55 leading-tight mt-0.5">
                    {row.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
