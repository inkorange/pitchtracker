"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { EyebrowTag } from "@/components/broadcast";
import { Spinner } from "@/components/feedback/Spinner";
import {
  activeFilterCount,
  CHASE_ZONES,
  querySentence,
  RESULT_GROUPS,
  type ExploreFilters,
} from "@/lib/explore/query";
import { getPitchLabel } from "@/lib/viz/colors";
import type { SearchQuery } from "@/lib/savant/search";
import type { SearchAggregates } from "@/lib/savant/aggregates";
import type { SavantPitchRow } from "@/lib/savant/client";
import {
  OutcomeBody,
  outcomeSummary,
  WhatBody,
  whatSummary,
  WhenBody,
  whenSummary,
  WhoBody,
  whoSummary,
  type Patch,
  type SectionKey,
  type SectionProps,
} from "./FilterSections";
import { IndividualTable } from "./IndividualTable";
import { VisualizationPanel } from "./VisualizationPanel";
import { ZoneHeat } from "./ZoneHeat";

// /explore — design/Explore.dc.html + ExploreMobile.dc.html.
// URL keys are unchanged from the previous Explore (short keys keep
// share links readable, and old links keep working).

const HAND = parseAsStringLiteral(["L", "R"] as const);
const filterParsers = {
  pid: parseAsArrayOf(parseAsInteger).withDefault([]),
  bid: parseAsArrayOf(parseAsInteger).withDefault([]),
  pth: HAND,
  bst: HAND,
  pt: parseAsArrayOf(parseAsString).withDefault([]),
  s: parseAsArrayOf(parseAsInteger).withDefault([]),
  df: parseAsString,
  dt: parseAsString,
  c: parseAsArrayOf(parseAsString).withDefault([]),
  o: parseAsArrayOf(parseAsInteger).withDefault([]),
  inn: parseAsArrayOf(parseAsInteger).withDefault([]),
  gt: parseAsArrayOf(parseAsString).withDefault(["R"] as string[]),
  d: parseAsArrayOf(parseAsString).withDefault([]),
  ev: parseAsArrayOf(parseAsString).withDefault([]),
  bb: parseAsArrayOf(parseAsString).withDefault([]),
  z: parseAsArrayOf(parseAsInteger).withDefault([]),
  view: parseAsStringLiteral(["scene", "heat", "table"] as const).withDefault("scene"),
};

interface SearchResponse {
  rows: SavantPitchRow[];
  truncated: boolean;
  totalReturned: number;
  aggregates: SearchAggregates;
}

const SECTIONS: { key: SectionKey; title: string }[] = [
  { key: "who", title: "Who" },
  { key: "what", title: "What" },
  { key: "when", title: "When" },
  { key: "outcome", title: "Outcome" },
];

const SAVED_KEY = "pt.explore.saved";
interface SavedQuery {
  label: string;
  qs: string;
}

function toQuery(f: ExploreFilters): SearchQuery {
  const arr = <T,>(x: T[]) => (x.length ? x : undefined);
  return {
    pitcherIds: arr(f.pid),
    batterIds: arr(f.bid),
    pitcherThrows: f.pth ?? undefined,
    batterStands: f.bst ?? undefined,
    pitchTypes: arr(f.pt),
    seasons: arr(f.s),
    gameDateFrom: f.df ?? undefined,
    gameDateTo: f.dt ?? undefined,
    counts: arr(f.c),
    outs: arr(f.o),
    innings: arr(f.inn),
    gameTypes: arr(f.gt),
    descriptions: arr(f.d),
    events: arr(f.ev),
    battedBallTypes: arr(f.bb),
    zones: arr(f.z),
  };
}

const EXAMPLES: { label: string; patch: Patch }[] = [
  { label: "Two-strike sweepers", patch: { pt: ["ST"], c: ["0-2", "1-2", "2-2", "3-2"] } },
  { label: "Chase-zone whiffs", patch: { z: CHASE_ZONES, d: RESULT_GROUPS[0].codes } },
  { label: "Curveball strikeouts", patch: { pt: ["CU", "KC"], ev: ["strikeout"] } },
  { label: "Home runs off changeups", patch: { pt: ["CH"], ev: ["home_run"] } },
];

const CLEARED: Patch = {
  pid: null, bid: null, pth: null, bst: null, pt: null, s: null, df: null, dt: null,
  c: null, o: null, inn: null, gt: ["R"], d: null, ev: null, bb: null, z: null,
};

export function ExploreClient({ seasons }: { seasons: number[] }) {
  const [state, setState] = useQueryStates(filterParsers, { history: "replace" });
  const { view, ...f } = state;
  const set = useCallback((patch: Patch) => void setState(patch), [setState]);

  const [result, setResult] = useState<SearchResponse | null>(null);
  const [lastRunKey, setLastRunKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ who: true, what: true, when: false, outcome: false });
  const [sheet, setSheet] = useState<SectionKey | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [pitcherNames, setPitcherNames] = useState<Map<number, string>>(new Map());
  const [batterNames, setBatterNames] = useState<Map<number, string>>(new Map());
  const [toast, setToast] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedQuery[]>([]);

  const queryKey = JSON.stringify(toQuery(f));
  const nActive = activeFilterCount(f);
  const pName = useCallback((id: number) => pitcherNames.get(id) ?? `#${id}`, [pitcherNames]);
  const bName = useCallback((id: number) => batterNames.get(id) ?? `#${id}`, [batterNames]);
  const sentence = querySentence(f, { pitchers: pName, batters: bName, pitchLabel: getPitchLabel });
  const sentenceText = `Pitches ${sentence.map((p) => `${p.pre} ${p.v}`).join(" ")}`;

  async function runSearch() {
    if (nActive === 0) return;
    setLoading(true);
    setError(null);
    const key = queryKey;
    const ctrl = new AbortController();
    const timeoutId = window.setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: key,
        signal: ctrl.signal,
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Search failed (${res.status})`);
        return;
      }
      setResult(body as SearchResponse);
      setLastRunKey(key);
    } catch (err) {
      setError(
        err instanceof Error && err.name === "AbortError"
          ? "Savant took longer than 60s — try narrowing the filters."
          : err instanceof Error
            ? err.message
            : "Search failed",
      );
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  // Shared links arrive pre-filled: run them once on load.
  useEffect(() => {
    if (nActive > 0) void Promise.resolve().then(() => runSearch());
    // Saved queries live in localStorage, so they load after hydration.
    void Promise.resolve().then(() => {
      try {
        setSaved(JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as SavedQuery[]);
      } catch {
        /* ignore corrupt storage */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mobile sheet: lock page scroll and close on Escape.
  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(null);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [sheet]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const stale = result != null && lastRunKey !== queryKey;
  const sectionProps: SectionProps = {
    f,
    set,
    seasons,
    onPitcherNames: setPitcherNames,
    onBatterNames: setBatterNames,
    showAllEvents,
    setShowAllEvents,
  };
  const summaries: Record<SectionKey, string> = {
    who: whoSummary(f, pName, bName),
    what: whatSummary(f),
    when: whenSummary(f),
    outcome: outcomeSummary(f),
  };
  const bodies: Record<SectionKey, ReactNode> = {
    who: <WhoBody {...sectionProps} />,
    what: <WhatBody {...sectionProps} />,
    when: <WhenBody {...sectionProps} />,
    outcome: <OutcomeBody {...sectionProps} />,
  };

  const saveQuery = () => {
    const entry = { label: sentenceText.replace(/^Pitches /, ""), qs: window.location.search };
    const next = [entry, ...saved.filter((s) => s.qs !== entry.qs)].slice(0, 6);
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    setToast("Query saved — find it under “Saved”.");
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setToast("Link copied.");
    } catch {
      setToast("Couldn’t copy — copy the address bar instead.");
    }
  };

  const countLine = loading ? (
    <span className="flex items-center gap-2">
      <Spinner /> Searching…
    </span>
  ) : result && !stale ? (
    <>
      <span className="text-ink font-bold num">{result.aggregates.totalPitches.toLocaleString()}</span> pitches
    </>
  ) : nActive === 0 ? (
    "Pick a filter to search"
  ) : stale ? (
    "Filters changed — run to update"
  ) : (
    "Run to count pitches"
  );

  const runButton = (cls: string, label = "Run search") => (
    <button
      type="button"
      onClick={() => {
        setSheet(null);
        void runSearch();
      }}
      disabled={nActive === 0 || loading}
      className={`rounded-control bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent text-white font-display font-bold tracking-[1px] uppercase ${cls}`}
    >
      {label}
    </button>
  );

  return (
    <div className="pb-24 md:pb-16">
      {/* Everything behind the mobile filter sheet goes inert while it's open. */}
      <div inert={sheet != null}>
      {/* Head */}
      <section className="container-page pt-6 pb-4 md:pt-12 md:pb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div className="flex flex-col gap-2.5">
          <EyebrowTag className="self-start">Explore</EyebrowTag>
          <h1 className="m-0 font-display font-extrabold italic uppercase text-[46px] md:text-[64px] leading-[0.92]">
            Query every pitch.
          </h1>
          <p className="m-0 text-[15px] md:text-base text-ink-2 max-w-[620px]">
            Build a Statcast search by who, what, when and outcome, then see the results in 3D.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap md:justify-end">
          <span className="text-[13px] text-muted">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setState({ ...CLEARED, ...ex.patch });
                setResult(null);
              }}
              className="h-11 md:h-9 px-3 rounded-full border border-line-strong text-[13px] text-ink-2 hover:text-ink hover:border-ink-2"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </section>
      {saved.length ? (
        <div className="container-page -mt-1 mb-3 flex gap-2 items-center flex-wrap">
          <span className="text-[13px] text-muted">Saved:</span>
          {saved.map((s) => (
            <a
              key={s.qs}
              href={`/explore${s.qs}`}
              className="h-9 max-w-[320px] px-3 flex items-center rounded-full border border-line-strong text-[13px] text-ink-2 hover:text-ink truncate"
              title={s.label}
            >
              <span className="truncate">{s.label}</span>
            </a>
          ))}
        </div>
      ) : null}

      {/* Query sentence */}
      <div className="container-page">
        <div
          aria-label="Current query"
          className="flex items-center gap-x-2 gap-y-1 flex-wrap min-h-14 px-4 md:px-[18px] py-2.5 bg-surface border border-line border-l-4 border-l-accent rounded-control"
        >
          <span className="font-display font-bold text-lg tracking-[0.5px] text-muted uppercase">Pitches</span>
          {sentence.map((w, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="text-muted">{w.pre}</span>
              <span className="font-display font-bold text-lg md:text-xl tracking-[0.3px] text-ink">{w.v}</span>
            </span>
          ))}
          <span className="grow" />
          {nActive > 0 ? (
            <button
              type="button"
              onClick={() => {
                setState(CLEARED);
                setResult(null);
                setError(null);
              }}
              className="h-9 px-3 rounded-control text-[13px] font-semibold text-accent-hover hover:text-ink"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="container-page mt-4 flex flex-wrap gap-5 items-start">
        {/* Filters (desktop) */}
        <aside
          aria-label="Filters"
          className="hidden lg:flex flex-col flex-[0_1_400px] min-w-[320px] bg-bg-raised border border-line rounded-panel overflow-hidden lg:sticky lg:top-20 max-h-[calc(100dvh-6rem)]"
        >
          <div className="grow min-h-0 overflow-y-auto scrollbar-thin">
            {SECTIONS.map((sec) => (
              <section key={sec.key} className="border-b border-line">
                <h2 className="m-0">
                  <button
                    type="button"
                    aria-expanded={open[sec.key]}
                    aria-controls={`sec-${sec.key}`}
                    onClick={() => setOpen((o) => ({ ...o, [sec.key]: !o[sec.key] }))}
                    className="w-full flex items-center gap-3 min-h-14 px-[18px] text-left text-ink"
                  >
                    <span className="w-[88px] shrink-0 font-display font-extrabold text-xl tracking-[1px] uppercase">{sec.title}</span>
                    <span className="grow min-w-0 text-[13px] text-muted truncate font-normal">{summaries[sec.key]}</span>
                    <svg
                      aria-hidden="true"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      className={`shrink-0 text-ink-2 motion-safe:transition-transform ${open[sec.key] ? "rotate-180" : ""}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </h2>
                {open[sec.key] ? (
                  <div id={`sec-${sec.key}`} className="px-[18px] pb-5 flex flex-col gap-[18px]">
                    {bodies[sec.key]}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
          <div className="flex items-center gap-3 px-[18px] py-3.5 border-t border-line bg-bg-raised">
            <span className="grow text-[13px] text-muted" aria-live="polite">
              {countLine}
            </span>
            {runButton("h-11 px-5 text-lg")}
          </div>
        </aside>

        {/* Results */}
        <main className="flex-[999_1_560px] min-w-0 flex flex-col gap-3.5">
          {error ? (
            <div role="alert" className="rounded-control border border-accent/60 bg-accent/10 px-4 py-3 text-sm text-ink">
              {error}
            </div>
          ) : null}
          {loading && !result ? <ResultsSkeleton /> : null}
          {!result && !loading ? <EmptyState hasFilters={nActive > 0} onRun={runSearch} /> : null}
          {result ? (
            <Results
              result={result}
              stale={stale}
              loading={loading}
              view={view}
              setView={(v) => setState({ view: v === "scene" ? null : v })}
              onSave={saveQuery}
              onCopy={copyLink}
            />
          ) : null}
        </main>
      </div>

      {/* Mobile: floating filter button */}
      <button
        type="button"
        onClick={() => setSheet("who")}
        className="lg:hidden fixed z-30 left-1/2 -translate-x-1/2 bottom-5 h-12 px-6 rounded-full bg-accent text-white font-display font-bold text-lg tracking-[1px] uppercase shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
      >
        Edit filters{nActive ? ` (${nActive})` : ""}
      </button>
      </div>
      {sheet ? (
        <div role="dialog" aria-modal="true" aria-label="Edit filters" className="lg:hidden fixed inset-0 z-50 flex flex-col bg-bg">
          <div className="flex items-center justify-between h-14 px-5 border-b border-line">
            <span className="font-display font-extrabold text-xl uppercase">Filters</span>
            <button type="button" onClick={() => setSheet(null)} aria-label="Close filters" className="size-11 flex items-center justify-center text-2xl text-ink-2">
              ×
            </button>
          </div>
          <div role="tablist" aria-label="Filter group" className="flex border-b border-line">
            {SECTIONS.map((sec) => (
              <button
                key={sec.key}
                role="tab"
                type="button"
                aria-selected={sheet === sec.key}
                onClick={() => setSheet(sec.key)}
                className={`flex-1 h-12 font-display font-bold text-base tracking-[1px] uppercase border-b-[3px] ${
                  sheet === sec.key ? "text-ink border-accent" : "text-muted border-transparent"
                }`}
              >
                {sec.title}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="grow overflow-y-auto px-5 py-5 flex flex-col gap-[18px]">
            {bodies[sheet]}
          </div>
          <div className="flex items-center gap-3 px-5 py-3 border-t border-line bg-bg-raised">
            <span className="grow text-[13px] text-muted">{countLine}</span>
            {runButton("h-12 px-5 text-lg", "Show pitches")}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div role="status" className="fixed z-50 bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-control bg-ink text-bg text-sm font-semibold shadow-xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ hasFilters, onRun }: { hasFilters: boolean; onRun: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 p-6 md:p-8 bg-surface border border-line rounded-panel">
      <h2 className="m-0 font-display font-extrabold text-[28px] uppercase">
        {hasFilters ? "Ready when you are." : "Start with a filter."}
      </h2>
      <p className="m-0 text-ink-2 max-w-prose">
        {hasFilters
          ? "Your filters are set. Run the search to pull the matching pitches from Statcast."
          : "Pick a pitcher, a pitch type, a count or an outcome — or tap one of the examples above. Results show in 3D, as a zone heat map, and as a table you can export."}
      </p>
      {hasFilters ? (
        <button type="button" onClick={onRun} className="h-11 px-5 rounded-control bg-accent hover:bg-accent-hover text-white font-display font-bold text-lg tracking-[1px] uppercase">
          Run search
        </button>
      ) : null}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3.5">
      <div className="h-[74px] rounded-control bg-surface border border-line motion-safe:animate-pulse" />
      <div className="h-[420px] rounded-panel bg-surface border border-line motion-safe:animate-pulse flex items-center justify-center gap-3 text-muted">
        <Spinner className="size-6" /> Pulling pitches from Statcast…
      </div>
    </div>
  );
}

const VIEWS = [
  { key: "scene", label: "3D scene" },
  { key: "heat", label: "Zone heat" },
  { key: "table", label: "Table only" },
] as const;

function Results({
  result,
  stale,
  loading,
  view,
  setView,
  onSave,
  onCopy,
}: {
  result: SearchResponse;
  stale: boolean;
  loading: boolean;
  view: "scene" | "heat" | "table";
  setView: (v: "scene" | "heat" | "table") => void;
  onSave: () => void;
  onCopy: () => void;
}) {
  const a = result.aggregates;
  const batters = useMemo(() => new Set(result.rows.map((r) => r.batter)).size, [result.rows]);
  const fmt = (n: number | null, d = 1) => (n == null ? "—" : n.toFixed(d));
  const strip: [string, string][] = [
    ["Pitches", a.totalPitches.toLocaleString()],
    ["Avg mph", fmt(a.avgVelocity)],
    ["Avg spin", a.avgSpinRate == null ? "—" : Math.round(a.avgSpinRate).toLocaleString()],
    ["Whiff/swing %", a.whiffRate == null ? "—" : (a.whiffRate * 100).toFixed(1)],
    ["Batters", batters.toLocaleString()],
  ];

  return (
    <>
      <dl
        className={`m-0 grid grid-cols-3 md:grid-cols-5 bg-surface border border-line border-t-[3px] border-t-accent rounded-control transition-opacity ${
          stale || loading ? "opacity-60" : ""
        }`}
      >
        {strip.map(([k, v], i) => (
          <div key={k} className={`px-3.5 py-3 border-r border-line flex flex-col min-w-0 ${i >= 3 ? "max-md:hidden" : ""}`}>
            <dt className="label-caps truncate">{k}</dt>
            <dd className="m-0 font-display font-bold text-[26px] md:text-[30px] leading-[1.05] num">{v}</dd>
          </div>
        ))}
      </dl>
      {result.truncated ? (
        <p className="m-0 text-[13px] text-highlight">
          Showing the first {result.rows.length.toLocaleString()} of {result.totalReturned.toLocaleString()} — narrow your
          filters for a complete result.
        </p>
      ) : null}

      <div className="flex justify-between items-center gap-2.5 flex-wrap">
        <div role="tablist" aria-label="Result view" className="flex bg-surface border border-line rounded-control p-[3px]">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              role="tab"
              type="button"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              className={`h-11 md:h-[34px] px-3.5 rounded-[3px] text-[13px] ${
                view === v.key ? "bg-ink text-bg font-bold" : "text-ink-2 font-semibold hover:text-ink"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(
            [
              ["Save query", onSave],
              ["Copy link", onCopy],
              ["Export CSV", () => downloadCsv(result.rows)],
            ] as const
          ).map(([label, fn]) => (
            <button
              key={label}
              type="button"
              onClick={fn}
              className="h-11 md:h-9 px-3.5 rounded-control border border-line-strong text-[13px] font-semibold text-ink hover:border-ink-2"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "scene" ? <VisualizationPanel rows={result.rows} /> : null}
      {view === "heat" ? <ZoneHeat rows={result.rows} /> : null}
      <IndividualTable rows={result.rows} />
    </>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────
const CSV_COLUMNS: Array<keyof SavantPitchRow> = [
  "game_date", "game_pk", "at_bat_number", "pitch_number", "pitcher", "batter", "pitch_type",
  "description", "events", "balls", "strikes", "release_speed", "release_spin_rate", "spin_axis",
  "pfx_x", "pfx_z", "plate_x", "plate_z", "release_pos_x", "release_pos_y", "release_pos_z",
];
const CSV_LABEL: Partial<Record<keyof SavantPitchRow, string>> = { pitcher: "pitcher_id", batter: "batter_id" };

function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: SavantPitchRow[]) {
  const header = CSV_COLUMNS.map((c) => CSV_LABEL[c] ?? c).join(",");
  const body = rows.map((r) => CSV_COLUMNS.map((c) => escapeCsvCell(r[c])).join(",")).join("\n");
  const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pitchtracker-explore-${new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
