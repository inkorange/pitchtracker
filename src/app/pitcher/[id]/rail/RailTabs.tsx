"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { RAIL_TAB_EVENT, type RailTab } from "./usePitcherUrl";

const TABS: { key: Exclude<RailTab, "matchups">; label: string }[] = [
  { key: "arsenal", label: "Arsenal" },
  { key: "filters", label: "Filters" },
  { key: "games", label: "Games" },
];

/**
 * Rail body: Arsenal | Filters (badge = active filter count) | Games
 * tabs, a scrolling body, and a sticky footer with the pitch count and
 * "Find at-bats" (opens the matchup finder in the rail body).
 */
export function RailTabs({
  arsenal,
  filters,
  games,
  matchups,
  countLabel,
  countSub,
}: {
  arsenal: ReactNode;
  filters: ReactNode;
  games: ReactNode;
  matchups: ReactNode;
  countLabel: string;
  countSub: string | null;
}) {
  const sp = useSearchParams();
  const inAtBat = sp.has("abGame") && sp.has("abNum");
  const [tab, setTab] = useState<RailTab>(inAtBat ? "matchups" : "arsenal");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // An at-bat replay opens the matchup view.
  const [prevAtBat, setPrevAtBat] = useState(inAtBat);
  if (prevAtBat !== inAtBat) {
    setPrevAtBat(inAtBat);
    if (inAtBat) setTab("matchups");
  }

  useEffect(() => {
    const on = (e: Event) => setTab((e as CustomEvent<RailTab>).detail);
    window.addEventListener(RAIL_TAB_EVENT, on);
    return () => window.removeEventListener(RAIL_TAB_EVENT, on);
  }, []);

  const filterCount = ["hand", "outcome", "event"].reduce(
    (n, k) => n + (sp.get(k) ? (sp.get(k) ?? "").split(",").filter(Boolean).length : 0),
    0,
  ) + (sp.get("veloMin") || sp.get("veloMax") ? 1 : 0);

  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.key === tab);
    let next = i;
    if (e.key === "ArrowRight") next = (Math.max(i, 0) + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (Math.max(i, 0) - 1 + TABS.length) % TABS.length;
    else return;
    e.preventDefault();
    setTab(TABS[next].key);
    refs.current[next]?.focus();
  };

  const bodies: Record<RailTab, ReactNode> = { arsenal, filters, games, matchups };

  return (
    <>
      <div role="tablist" aria-label="Panels" onKeyDown={onKey} className="flex px-3 border-b border-line shrink-0">
        {TABS.map((t, i) => {
          const sel = tab === t.key;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`rail-tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={sel}
              aria-controls="rail-panel"
              tabIndex={sel || (tab === "matchups" && i === 0) ? 0 : -1}
              onClick={() => setTab(t.key)}
              className={`h-12 px-3 flex items-center text-sm border-b-[3px] -mb-px ${
                sel ? "text-ink font-semibold border-accent" : "text-ink-2 font-medium border-transparent hover:text-ink"
              }`}
            >
              {t.label}
              {t.key === "filters" && filterCount > 0 ? (
                <span className="ml-1.5 min-w-5 h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center num">
                  {filterCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        id="rail-panel"
        role="tabpanel"
        aria-labelledby={tab === "matchups" ? undefined : `rail-tab-${tab}`}
        aria-label={tab === "matchups" ? "Find at-bats" : undefined}
        className="grow min-h-0 overflow-y-auto scrollbar-thin px-5 py-4"
      >
        {tab === "matchups" ? (
          <button
            type="button"
            onClick={() => setTab("arsenal")}
            className="mb-3 h-8 text-[13px] font-semibold text-accent-hover hover:text-ink"
          >
            ← Back to arsenal
          </button>
        ) : null}
        {bodies[tab]}
      </div>

      <div className="flex items-center gap-3 px-5 py-3.5 border-t border-line bg-bg-raised shrink-0">
        <div className="grow flex flex-col min-w-0">
          <span className="font-display font-bold text-[22px] leading-none num">{countLabel}</span>
          {countSub ? <span className="text-xs text-muted">{countSub}</span> : null}
        </div>
        <button
          type="button"
          aria-pressed={tab === "matchups"}
          onClick={() => setTab(tab === "matchups" ? "arsenal" : "matchups")}
          className="h-11 px-4 rounded-control border border-line-strong text-sm font-semibold text-ink hover:border-ink-2 aria-pressed:bg-ink aria-pressed:text-bg"
        >
          Find at-bats
        </button>
      </div>
    </>
  );
}
