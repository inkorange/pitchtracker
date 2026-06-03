"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PitcherSearch } from "@/components/search/PitcherSearch";

// Search-icon trigger that opens a full-page overlay:
//   - Dim/blur backdrop covers the whole viewport (TopNav included)
//     and click-to-close.
//   - The search input is FIXED-positioned at the same coordinates
//     as the in-nav trigger and animates leftward (width transition)
//     so it visually grows out from the icon, overlaying any other
//     nav items it crosses on mobile and desktop alike.
//   - An X button sits where the icon was so a tap there also closes.
//   - Esc closes.
//
// The in-nav trigger button stays mounted so the nav reserves space
// for the icon when closed; when open it's covered by the X button.
const INPUT_WIDTH = "w-[min(20rem,calc(100vw-5rem))]";

export function PitcherSearchPopover() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputWrapRef = useRef<HTMLDivElement>(null);

  // The overlay portals to document.body so it escapes TopNav's
  // `backdrop-blur-md` — that filter establishes a containing block
  // for fixed descendants, otherwise the backdrop scrim clips to the
  // nav's 48px height.
  useEffect(() => {
    // Standard SSR-portal mount gate — we deliberately set state in
    // an effect so the portal target only resolves client-side.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the input each time we open. Keep the input mounted between
  // open/close cycles so the width transition has a stable subtree to
  // animate against — autofocus would only fire on initial mount.
  useEffect(() => {
    if (!open) return;
    const el = inputWrapRef.current?.querySelector("input");
    if (el instanceof HTMLInputElement) el.focus();
  }, [open]);

  const overlay = (
    <>
      {/* Backdrop scrim — covers the entire viewport because it's
          portaled outside TopNav. Click to close. */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/55 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      {/* Search panel + close button, anchored at the nav's right
          padding (matches the in-nav icon's position) so the input
          expands leftward from that point. Z-50 sits above the
          backdrop. */}
      <div
        className={`fixed top-2 right-3 sm:right-6 z-50 flex items-center gap-1.5 ${
          open ? "" : "pointer-events-none"
        }`}
      >
        <div
          className={`overflow-hidden transition-[width,opacity] duration-200 ease-out ${
            open ? `${INPUT_WIDTH} opacity-100` : "w-0 opacity-0"
          }`}
          aria-hidden={!open}
        >
          <div ref={inputWrapRef} className={INPUT_WIDTH}>
            {/* Nav-scale padding override — the shared PitcherSearch
                input is sized for a content-area dock. */}
            <div className="[&_input]:py-1.5 [&_input]:text-sm">
              <PitcherSearch placeholder="Search a pitcher…" />
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close pitcher search"
          className={`inline-flex items-center justify-center w-8 h-8 rounded-md bg-white/[0.12] text-white/90 hover:bg-white/[0.2] transition-opacity duration-150 flex-shrink-0 ${
            open ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
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
            aria-hidden
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </>
  );

  return (
    <>
      {mounted ? createPortal(overlay, document.body) : null}
      {/* In-nav trigger. Always mounted so the right side of the nav
          reserves the icon's width; the X button overlays it 1:1
          when open. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
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
    </>
  );
}
