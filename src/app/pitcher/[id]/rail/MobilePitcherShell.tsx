"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { openPalette } from "@/components/chrome/CommandPalette";
import { BottomSheet, type SnapIndex } from "@/components/sheet/BottomSheet";
import { openAiChat } from "@/lib/ai/open-chat";
import { usePitcherView } from "../StatsModeToggle";
import { useFilterChips } from "./SceneChrome";
import { AtBatMobileHeader, AtBatMobilePanel } from "../atbat/AtBatMobile";
import { RAIL_TAB_EVENT, usePitcherUrl, type RailTab } from "./usePitcherUrl";

// Mobile / tablet (< lg) pitcher page — design/MobileSheetPeek.dc.html +
// MobileSheetFilters.dc.html: header, filter chips over the scene, and
// a draggable drawer (peek / half / full) with Arsenal | Filters | Games.

const TABS: { key: Exclude<RailTab, "matchups">; label: string }[] = [
  { key: "arsenal", label: "Arsenal" },
  { key: "filters", label: "Filters" },
  { key: "games", label: "Games" },
];

export function MobilePitcherShell({
  pitcherName,
  shortName,
  meta,
  pitchCount,
  totalPitches,
  season,
  gameLabels,
  batterName,
  arsenalCards,
  arsenalList,
  filters,
  games,
  matchups,
}: {
  pitcherName: string;
  shortName: string;
  meta: string;
  pitchCount: number;
  totalPitches: number;
  season: number;
  gameLabels: Record<string, string>;
  batterName: string | null;
  arsenalCards: ReactNode;
  arsenalList: ReactNode;
  filters: ReactNode;
  games: ReactNode;
  matchups: ReactNode;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const inAtBat = sp.has("abGame") && sp.has("abNum");
  const [view, setView] = usePitcherView();
  const [snap, setSnap] = useState<SnapIndex>(0);
  const [tab, setTab] = useState<RailTab>(inAtBat ? "matchups" : "arsenal");
  const { update } = usePitcherUrl();
  const chips = useFilterChips(gameLabels, batterName);

  const [prevAtBat, setPrevAtBat] = useState(inAtBat);
  if (prevAtBat !== inAtBat) {
    setPrevAtBat(inAtBat);
    if (inAtBat) setTab("matchups");
  }

  useEffect(() => {
    const on = (e: Event) => {
      setTab((e as CustomEvent<RailTab>).detail);
      setSnap((s) => (s === 0 ? 1 : s));
    };
    window.addEventListener(RAIL_TAB_EVENT, on);
    return () => window.removeEventListener(RAIL_TAB_EVENT, on);
  }, []);

  const filterCount =
    ["hand", "outcome", "event"].reduce((n, k) => n + (sp.get(k) ?? "").split(",").filter(Boolean).length, 0) +
    (sp.get("veloMin") || sp.get("veloMax") ? 1 : 0);
  const anyFilter = filterCount > 0 || sp.has("pitch") || sp.has("game");

  const openTab = (t: RailTab) => {
    setTab(t);
    if (snap === 0 && t !== "arsenal") setSnap(1);
  };

  let body: ReactNode;
  if (tab === "arsenal") body = snap === 0 ? arsenalCards : <div className="px-5 py-3">{arsenalList}</div>;
  else if (tab === "filters")
    body = (
      <>
        <div className="grow min-h-0 overflow-y-auto px-5 py-4">{filters}</div>
        <div className="shrink-0 flex gap-2 px-5 py-3 border-t border-line bg-bg-raised">
          <button
            type="button"
            disabled={!anyFilter}
            onClick={() => update({ hand: null, outcome: null, event: null, veloMin: null, veloMax: null, pitch: null, game: null })}
            className="h-12 px-4 rounded-control border border-line-strong text-sm font-semibold text-accent-hover disabled:text-muted disabled:opacity-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setSnap(0)}
            className="grow h-12 rounded-control bg-accent text-white font-display font-bold text-lg tracking-[1px] uppercase"
          >
            View {pitchCount.toLocaleString()} pitches
          </button>
        </div>
      </>
    );
  else body = <div className="grow min-h-0 overflow-y-auto px-5 py-4">{tab === "games" ? games : matchups}</div>;

  return (
    <div className="lg:hidden">
      {inAtBat ? <AtBatMobileHeader pitcherName={pitcherName} season={season} /> : null}
      {/* Header */}
      <header hidden={inAtBat} className="absolute inset-x-0 top-0 h-14 z-30 flex items-center gap-1 pl-1 pr-2 bg-bg-raised border-b border-line">
        <button
          type="button"
          aria-label="Back"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/pitchers"))}
          className="size-11 flex items-center justify-center text-ink"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="grow min-w-0 flex flex-col">
          <p role="heading" aria-level={1} className="m-0 font-display font-extrabold text-[22px] leading-none uppercase truncate">
            {shortName}
          </p>
          <span className="text-xs text-muted truncate">{meta}</span>
        </div>
        <button type="button" onClick={() => openAiChat()} aria-label="Ask PitchTracker" className="size-11 flex items-center justify-center text-ink">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6z" />
          </svg>
        </button>
        <button type="button" onClick={openPalette} aria-label="Search pitchers" className="size-11 flex items-center justify-center text-ink">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </button>
      </header>

      {/* View toggle + filter chips over the top of the scene */}
      <div hidden={inAtBat} className="absolute top-[68px] inset-x-0 z-20 flex gap-2 px-3 overflow-x-auto scrollbar-thin">
        <div role="group" aria-label="View" className="shrink-0 flex bg-overlay border border-line-strong rounded-control p-[3px]">
          {(
            [
              ["arsenal", "3D"],
              ["stats", "Stats"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={view === k}
              onClick={() => setView(k)}
              className={`h-[34px] px-3 rounded-[2px] text-[13px] ${view === k ? "bg-ink text-bg font-bold" : "text-ink-2 font-semibold"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {!inAtBat
          ? chips.map((c) => (
              <span
                key={`${c.k}-${c.v}`}
                className="shrink-0 h-10 pl-3 flex items-center rounded-full bg-overlay border border-line-strong text-[13px] font-semibold text-ink whitespace-nowrap"
              >
                {c.v}
                <button
                  type="button"
                  aria-label={`Remove filter: ${c.k} ${c.v}`}
                  onClick={() => update(c.clear)}
                  className="size-[34px] flex items-center justify-center text-ink-2 text-base"
                >
                  ×
                </button>
              </span>
            ))
          : null}
        {!inAtBat ? (
          <button
            type="button"
            onClick={() => openTab("filters")}
            className="shrink-0 h-10 px-3.5 rounded-full border border-dashed border-line-strong bg-overlay text-[13px] font-semibold text-ink-2 whitespace-nowrap"
          >
            + Filter
          </button>
        ) : null}
      </div>

      <BottomSheet
        index={snap}
        onIndexChange={setSnap}
        dismissed={inAtBat || (view === "stats" && snap === 0)}
        label="Pitcher panel"
        header={
          <>
            <div className="px-5 pb-2.5 flex items-baseline justify-between gap-3">
              <span className="font-display font-extrabold text-[26px] leading-none uppercase num">
                {pitchCount.toLocaleString()} pitch{pitchCount === 1 ? "" : "es"}
              </span>
              <span className="text-xs text-muted num">
                {tab === "filters" && snap > 0 ? "updates live" : `of ${totalPitches.toLocaleString()} · ${season}`}
              </span>
            </div>
            <div role="tablist" aria-label="Panels" data-no-drag className="flex px-3 border-b border-line">
              {TABS.map((t) => {
                const sel = tab === t.key;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    type="button"
                    aria-selected={sel}
                    onClick={() => openTab(t.key)}
                    className={`h-11 px-3 flex items-center text-sm border-b-[3px] -mb-px ${
                      sel ? "text-ink font-semibold border-accent" : "text-muted font-semibold border-transparent"
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
              {tab === "matchups" ? (
                <button type="button" onClick={() => openTab("arsenal")} className="ml-auto h-11 px-2 text-[13px] font-semibold text-accent-hover">
                  ← Arsenal
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    openTab("matchups");
                    setSnap(2);
                  }}
                  className="ml-auto h-11 px-2 text-[13px] font-semibold text-accent-hover"
                >
                  Find at-bats
                </button>
              )}
            </div>
          </>
        }
      >
        {body}
      </BottomSheet>
      {inAtBat ? <AtBatMobilePanel /> : null}
    </div>
  );
}
