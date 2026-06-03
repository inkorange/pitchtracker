"use client";

import { useEffect, useRef, useState } from "react";
import { PitcherSearch } from "@/components/search/PitcherSearch";

// Search-icon trigger for the top nav. Clicking the magnifying glass
// opens a popover anchored to the icon that renders the existing
// PitcherSearch typeahead. Lifts the search out of the page content
// area so the 3D scene gets the full viewport.
//
// Open / close behavior:
//   - Click the icon to toggle open.
//   - Esc closes.
//   - Click outside the popover (or icon) closes.
//   - Navigating to a result closes (PitcherSearch already calls its
//     own onClick → setOpen(false) for results; route change unmounts
//     this component anyway).
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

  // Focus the input when the popover opens. PitcherSearch exposes
  // autoFocus, but it only fires on the first mount — we remount the
  // input each open so a fresh focus always lands.
  useEffect(() => {
    if (!open) return;
    const el = inputWrapRef.current?.querySelector("input");
    if (el instanceof HTMLInputElement) el.focus();
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Search pitchers"
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
      {open ? (
        <div
          ref={inputWrapRef}
          role="dialog"
          aria-label="Search pitchers"
          className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1.5rem))] z-40"
        >
          <PitcherSearch placeholder="Search a pitcher…" />
        </div>
      ) : null}
    </div>
  );
}
