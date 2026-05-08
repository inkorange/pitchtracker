"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePitcherView } from "./StatsModeToggle";
import { PitcherStatsView } from "./PitcherStatsView";

// Match Tailwind's `sm` breakpoint. Above sm the stats area sits to
// the right of the pitcher card, so the dynamic mobile top doesn't
// apply.
const SM_MQL = "(min-width: 640px)";
function subscribeIsDesktop(callback: () => void): () => void {
  const mql = window.matchMedia(SM_MQL);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function getIsDesktopSnapshot(): boolean {
  return window.matchMedia(SM_MQL).matches;
}
function getIsDesktopServerSnapshot(): boolean {
  return false;
}

const MOBILE_GAP_PX = 8;
const FALLBACK_TOP_PX = 224; // ~14rem (collapsed pitcher card bottom)

// Positions the analytics view OUTSIDE the pitcher card so it can
// take the full main area without being trapped by the card's narrow
// column. Renders nothing in arsenal mode.
//
// On mobile, the section's top tracks the pitcher card's bottom edge
// via a ResizeObserver — when the user collapses the card the stats
// slide up to sit just below it; when they expand the card the stats
// slide down. The card and stats are always both visible.
//
// On desktop (lg+), the stats area lives to the right of the card at
// a fixed top offset; the card's height doesn't displace it.
export function PitcherStatsArea() {
  const [view] = usePitcherView();
  const isDesktop = useSyncExternalStore(
    subscribeIsDesktop,
    getIsDesktopSnapshot,
    getIsDesktopServerSnapshot,
  );
  const [mobileTopPx, setMobileTopPx] = useState<number>(FALLBACK_TOP_PX);

  useEffect(() => {
    if (view !== "stats" || isDesktop) return;
    const card = document.querySelector("[data-pitcher-card]");
    if (!card) return;
    const update = () => {
      const rect = (card as HTMLElement).getBoundingClientRect();
      setMobileTopPx(rect.bottom + MOBILE_GAP_PX);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(card);
    return () => ro.disconnect();
  }, [view, isDesktop]);

  if (view !== "stats") return null;

  // Above sm the stats area docks to the right of the pitcher card
  // at a fixed top — the card's height doesn't displace it. Below sm
  // it stacks under the card with a dynamic top sourced from the
  // ResizeObserver. (The two-column INSIDE the stats view is still
  // gated at lg so cards have room before splitting columns.)
  return (
    <section
      style={isDesktop ? undefined : { top: mobileTopPx }}
      className="absolute left-3 right-3 bottom-3 sm:top-28 sm:left-[23.5rem] sm:right-6 sm:bottom-6 z-10 overflow-y-auto pointer-events-auto pb-4"
      aria-label="Pitcher stats"
    >
      <PitcherStatsView />
    </section>
  );
}
