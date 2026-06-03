"use client";

import { useEffect, useRef, useState } from "react";
import { PitcherSearch } from "@/components/search/PitcherSearch";

// Search-icon trigger for the top nav. Clicking the magnifying glass
// expands an inline pitcher-search input out to the LEFT of the icon
// with a horizontal width animation, so the input visually grows from
// the icon's anchor rather than popping in.
//
// Open / close behavior:
//   - Click the icon to toggle.
//   - Esc closes.
//   - Click outside closes.
//   - Navigating to a result closes (route change unmounts).
//
// The input wrapper has a fixed inner width and animates the outer
// width from 0 → that width with overflow-hidden. The PitcherSearch
// dropdown lives inside the inner fixed-width div so the typeahead
// results render at full width regardless of the expansion progress —
// in practice users won't have typed two characters before the 200ms
// width transition has finished anyway.
const INPUT_WIDTH = "w-[min(18rem,calc(100vw-6rem))]";

export function PitcherSearchPopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  // Focus the input each time the popover opens. PitcherSearch's
  // autoFocus prop only triggers on first mount; we always keep it
  // mounted so the width animation can play, so reach in for the
  // input on open instead.
  useEffect(() => {
    if (!open) return;
    const el = inputWrapRef.current?.querySelector("input");
    if (el instanceof HTMLInputElement) el.focus();
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex items-center gap-1">
      <div
        className={`overflow-hidden transition-[width,opacity] duration-200 ease-out ${
          open ? `${INPUT_WIDTH} opacity-100` : "w-0 opacity-0"
        }`}
        aria-hidden={!open}
      >
        <div ref={inputWrapRef} className={INPUT_WIDTH}>
          {/* The shared PitcherSearch component's input is bigger
              than fits comfortably in a nav — wrap it in a class
              override that tightens vertical padding. */}
          <div className="[&_input]:py-1.5 [&_input]:text-sm">
            <PitcherSearch placeholder="Search a pitcher…" />
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
        aria-label={open ? "Close pitcher search" : "Search pitchers"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
    </div>
  );
}
