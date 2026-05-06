"use client";

import { useEffect, useMemo, useState } from "react";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import {
  PITCH_TYPES,
  COUNTS,
  DESCRIPTIONS,
  EVENTS,
  BATTED_BALL_TYPES,
  GAME_TYPES,
  ZONES,
  type EnumOption,
} from "@/lib/savant/enums";
import { MultiPitcherPicker } from "@/components/search/MultiPitcherPicker";
import { AggregatePanel } from "./AggregatePanel";
import { IndividualTable } from "./IndividualTable";
import { VisualizationPanel } from "./VisualizationPanel";
import type { SearchQuery } from "@/lib/savant/search";
import type { SearchAggregates } from "@/lib/savant/aggregates";
import type { SavantPitchRow } from "@/lib/savant/client";

// URL state schema. Short keys keep the share URL readable.
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
  gt: parseAsArrayOf(parseAsString)
    .withDefault(["R"] as string[]),
  d: parseAsArrayOf(parseAsString).withDefault([]),
  ev: parseAsArrayOf(parseAsString).withDefault([]),
  bb: parseAsArrayOf(parseAsString).withDefault([]),
  z: parseAsArrayOf(parseAsInteger).withDefault([]),
};

const CURRENT_YEAR = new Date().getFullYear();
const SEASON_OPTIONS = Array.from({ length: 6 }, (_, i) => ({
  value: CURRENT_YEAR - i,
  label: String(CURRENT_YEAR - i),
}));

interface SearchResponse {
  rows: SavantPitchRow[];
  truncated: boolean;
  totalReturned: number;
  aggregates: SearchAggregates;
  cacheKey: string;
}

export function ExploreClient() {
  const [filters, setFilters] = useQueryStates(filterParsers, {
    history: "replace",
  });
  // Track an in-flight request id so a slow first response can't
  // clobber a faster second one if the user resubmits quickly.
  const [requestId, setRequestId] = useState(0);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildQuery = useMemo<() => SearchQuery>(() => {
    return () => ({
      pitcherIds: filters.pid?.length ? filters.pid : undefined,
      batterIds: filters.bid?.length ? filters.bid : undefined,
      pitcherThrows: filters.pth ?? undefined,
      batterStands: filters.bst ?? undefined,
      pitchTypes: filters.pt.length ? filters.pt : undefined,
      seasons: filters.s.length ? filters.s : undefined,
      gameDateFrom: filters.df ?? undefined,
      gameDateTo: filters.dt ?? undefined,
      counts: filters.c.length ? filters.c : undefined,
      outs: filters.o.length ? filters.o : undefined,
      innings: filters.inn.length ? filters.inn : undefined,
      gameTypes: filters.gt.length ? filters.gt : undefined,
      descriptions: filters.d.length ? filters.d : undefined,
      events: filters.ev.length ? filters.ev : undefined,
      battedBallTypes: filters.bb.length ? filters.bb : undefined,
      zones: filters.z.length ? filters.z : undefined,
    });
  }, [filters]);

  const hasAnyFilter = useMemo(() => {
    const q = buildQuery();
    return Boolean(
      q.pitcherIds?.length ||
        q.batterIds?.length ||
        q.pitcherThrows ||
        q.batterStands ||
        q.pitchTypes?.length ||
        q.seasons?.length ||
        q.gameDateFrom ||
        q.gameDateTo ||
        q.counts?.length ||
        q.outs?.length ||
        q.innings?.length ||
        q.gameTypes?.length ||
        q.descriptions?.length ||
        q.events?.length ||
        q.battedBallTypes?.length ||
        q.zones?.length,
    );
  }, [buildQuery]);

  async function runSearch() {
    setLoading(true);
    setError(null);
    const id = requestId + 1;
    setRequestId(id);
    // Abort if Savant takes longer than 60s (matches the route's
    // maxDuration). Without this the button can sit in "Searching…"
    // indefinitely on a hung upstream.
    const ctrl = new AbortController();
    const timeoutId = window.setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildQuery()),
        signal: ctrl.signal,
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Search failed (${res.status})`);
        return;
      }
      setResult(body as SearchResponse);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Savant took longer than 60s — try narrowing the filters.");
      } else {
        setError(err instanceof Error ? err.message : "Search failed");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  // Auto-run if the URL arrives pre-filled. Ensures shared links land
  // on a populated result instead of waiting for an explicit submit.
  // Deferred to a microtask so the synchronous setLoading/setError
  // inside runSearch don't fire during the effect itself (React
  // Compiler flags that as a cascading-render risk).
  useEffect(() => {
    if (hasAnyFilter && !result && !loading) {
      void Promise.resolve().then(() => runSearch());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearAll() {
    setFilters({
      pid: null,
      bid: null,
      pth: null,
      bst: null,
      pt: null,
      s: null,
      df: null,
      dt: null,
      c: null,
      o: null,
      inn: null,
      gt: ["R"],
      d: null,
      ev: null,
      bb: null,
      z: null,
    });
    setResult(null);
    setError(null);
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6 mt-6">
      {/* Filter rail. flex-col so the Run search button can sit in a
          non-scrolling footer at the bottom — keeping it in view no
          matter how far the user scrolls the filter list. */}
      {/* Aside height has to clear: TopNav (3rem fixed) + main pt-16
          (4rem) + grid mt-6 (1.5rem) + main pb-12 (3rem buffer) below.
          h-[calc(100dvh-9rem)] keeps the aside short enough that it
          can't push the page taller than the viewport. dvh handles
          mobile browser chrome (URL bar showing/hiding). */}
      <aside className="rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg flex flex-col overflow-hidden h-[calc(100dvh-9rem)] lg:sticky lg:top-20 lg:self-start lg:h-[calc(100dvh-9rem)]">
        {/* min-h-0 lets flex-1 actually shrink below its content size,
            so the aside's max-h is the real cap and the inner scroll
            kicks in instead of the aside growing past the viewport. */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.16em] text-white/70">
              Filters
            </h2>
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white"
            >
              Clear
            </button>
          </div>

          <FilterGroup label="Who">
          <MultiPitcherPicker
            label="Pitchers"
            value={filters.pid}
            onChange={(v) => setFilters({ pid: v.length ? v : null })}
          />
          <NumericListInput
            label="Batter IDs"
            placeholder="e.g. 592450"
            hint="Batter name search is coming. For now, copy the ID from the URL on mlb.com player pages (the digits after /player/)."
            value={filters.bid}
            onChange={(v) => setFilters({ bid: v.length ? v : null })}
          />
          <SegmentedSingle
            label="Pitcher hand"
            options={[
              { value: "L", label: "L" },
              { value: "R", label: "R" },
            ]}
            value={filters.pth ?? null}
            onChange={(v) => setFilters({ pth: (v ?? null) as "L" | "R" | null })}
          />
          <SegmentedSingle
            label="Batter stands"
            options={[
              { value: "L", label: "L" },
              { value: "R", label: "R" },
            ]}
            value={filters.bst ?? null}
            onChange={(v) => setFilters({ bst: (v ?? null) as "L" | "R" | null })}
          />
        </FilterGroup>

        <FilterGroup label="What">
          <ChipMulti
            label="Pitch types"
            options={PITCH_TYPES}
            value={filters.pt}
            onChange={(v) => setFilters({ pt: v.length ? v : null })}
          />
        </FilterGroup>

        <FilterGroup label="When">
          <ChipMulti
            label="Seasons"
            options={SEASON_OPTIONS}
            value={filters.s}
            onChange={(v) => setFilters({ s: v.length ? v : null })}
          />
          <div className="grid grid-cols-2 gap-2">
            <DateInput
              label="From"
              value={filters.df ?? ""}
              onChange={(v) => setFilters({ df: v || null })}
            />
            <DateInput
              label="To"
              value={filters.dt ?? ""}
              onChange={(v) => setFilters({ dt: v || null })}
            />
          </div>
          <ChipMulti
            label="Counts"
            options={COUNTS}
            value={filters.c}
            onChange={(v) => setFilters({ c: v.length ? v : null })}
          />
          <ChipMulti
            label="Outs"
            options={[
              { value: 0, label: "0" },
              { value: 1, label: "1" },
              { value: 2, label: "2" },
            ]}
            value={filters.o}
            onChange={(v) => setFilters({ o: v.length ? v : null })}
          />
          <ChipMulti
            label="Game types"
            options={GAME_TYPES}
            value={filters.gt}
            onChange={(v) => setFilters({ gt: v })}
          />
        </FilterGroup>

        <FilterGroup label="Outcome">
          <ChipMulti
            label="Pitch result"
            options={DESCRIPTIONS}
            value={filters.d}
            onChange={(v) => setFilters({ d: v.length ? v : null })}
          />
          <ChipMulti
            label="At-bat event"
            options={EVENTS}
            value={filters.ev}
            onChange={(v) => setFilters({ ev: v.length ? v : null })}
          />
          <ChipMulti
            label="Batted ball"
            options={BATTED_BALL_TYPES}
            value={filters.bb}
            onChange={(v) => setFilters({ bb: v.length ? v : null })}
          />
          <ChipMulti
            label="Zone"
            options={ZONES}
            value={filters.z}
            onChange={(v) => setFilters({ z: v.length ? v : null })}
          />
        </FilterGroup>
        </div>

        {/* Sticky footer — always visible above the scroll area so the
            user can run / re-run a search from anywhere in the form. */}
        <div className="border-t border-white/10 bg-[#081a32]/95 backdrop-blur-md p-3">
          <button
            type="button"
            onClick={runSearch}
            disabled={!hasAnyFilter || loading}
            className="w-full px-3 py-2 rounded-md bg-white/[0.12] hover:bg-white/[0.2] disabled:opacity-30 disabled:hover:bg-white/[0.12] border border-white/15 text-white text-[12px] uppercase tracking-[0.14em] transition-colors"
          >
            {loading ? "Searching…" : "Run search"}
          </button>
        </div>
      </aside>

      {/* Results placeholder — task 4 fills in tabs + visualization */}
      <section className="space-y-4">
        {!hasAnyFilter && !result ? (
          <ExampleQueries
            onPick={(q) => {
              setFilters(q);
            }}
          />
        ) : null}

        {error ? (
          <div className="rounded-lg bg-red-500/15 border border-red-400/40 text-red-100 px-4 py-3 text-sm">
            {error}
          </div>
        ) : null}

        {result ? <ResultPanel result={result} /> : null}
      </section>
    </div>
  );
}

// ─── result panel ───────────────────────────────────────────────────
// Tab strip + per-tab content. URL-state-keyed so the chosen view
// is part of the shareable link. Aggregate is the default; Individual
// and Visualization will fill in with their own panels in the next
// tasks.
type ResultMode = "aggregate" | "individual" | "viz";

// Columns we re-emit in the CSV. Keep the set narrow + obviously
// useful — the goal is a portable artifact someone can drop into a
// notebook, not a 1:1 copy of every Savant column.
const CSV_COLUMNS: Array<{
  key: keyof SavantPitchRow;
  label: string;
}> = [
  { key: "game_date", label: "game_date" },
  { key: "game_pk", label: "game_pk" },
  { key: "at_bat_number", label: "at_bat_number" },
  { key: "pitch_number", label: "pitch_number" },
  { key: "pitcher", label: "pitcher_id" },
  { key: "batter", label: "batter_id" },
  { key: "pitch_type", label: "pitch_type" },
  { key: "pitch_name", label: "pitch_name" },
  { key: "description", label: "description" },
  { key: "events", label: "events" },
  { key: "balls", label: "balls" },
  { key: "strikes", label: "strikes" },
  { key: "release_speed", label: "release_speed" },
  { key: "release_spin_rate", label: "release_spin_rate" },
  { key: "spin_axis", label: "spin_axis" },
  { key: "pfx_x", label: "pfx_x" },
  { key: "pfx_z", label: "pfx_z" },
  { key: "plate_x", label: "plate_x" },
  { key: "plate_z", label: "plate_z" },
  { key: "release_pos_x", label: "release_pos_x" },
  { key: "release_pos_y", label: "release_pos_y" },
  { key: "release_pos_z", label: "release_pos_z" },
];

function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Quote anything that contains comma / quote / newline; double up
  // any embedded quotes per RFC 4180.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: SavantPitchRow[]): string {
  const header = CSV_COLUMNS.map((c) => c.label).join(",");
  const body = rows
    .map((r) =>
      CSV_COLUMNS.map((c) => escapeCsvCell(r[c.key])).join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}

function downloadCsv(rows: SavantPitchRow[]) {
  if (typeof window === "undefined") return;
  const csv = rowsToCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  a.download = `pitchtracker-explore-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ResultPanel({ result }: { result: SearchResponse }) {
  // Local UI state — not URL-driven yet because tab choice doesn't
  // refire the search. Easy to lift to nuqs once Individual + Viz
  // settle.
  const [mode, setMode] = useState<ResultMode>("aggregate");

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg p-4 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/55">
            Pitches matched
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {result.aggregates.totalPitches.toLocaleString()}
          </div>
        </div>
        {result.truncated ? (
          <div className="text-[11px] text-amber-200/85 max-w-[18rem] text-right">
            Showing the first {result.rows.length.toLocaleString()} of{" "}
            {result.totalReturned.toLocaleString()} — narrow your filters for
            a complete result.
          </div>
        ) : null}
      </div>

      {/* Tab strip + CSV export */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex p-0.5 rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10">
          {(
            [
              { key: "aggregate" as const, label: "Aggregate" },
              { key: "individual" as const, label: "Individual" },
              { key: "viz" as const, label: "Visualization" },
            ] as const
          ).map((t) => {
            const active = mode === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setMode(t.key)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-md text-[11px] uppercase tracking-[0.14em] transition-colors ${
                  active
                    ? "bg-white/[0.12] text-white"
                    : "text-white/55 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(result.rows)}
          disabled={result.rows.length === 0}
          className="ml-auto px-3 py-1.5 rounded-md bg-[#081a32]/80 backdrop-blur-md border border-white/10 text-[11px] uppercase tracking-[0.14em] text-white/85 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
          title={`Download ${result.rows.length.toLocaleString()} rows as CSV`}
        >
          Export CSV
        </button>
      </div>

      {mode === "aggregate" ? (
        <AggregatePanel aggregates={result.aggregates} />
      ) : null}

      {mode === "individual" ? <IndividualTable rows={result.rows} /> : null}

      {mode === "viz" ? <VisualizationPanel rows={result.rows} /> : null}
    </div>
  );
}

// ─── example queries ────────────────────────────────────────────────
type FilterPatch = Partial<{
  pid: number[] | null;
  bid: number[] | null;
  pth: "L" | "R" | null;
  bst: "L" | "R" | null;
  pt: string[] | null;
  s: number[] | null;
  df: string | null;
  dt: string | null;
  c: string[] | null;
  o: number[] | null;
  inn: number[] | null;
  gt: string[] | null;
  d: string[] | null;
  ev: string[] | null;
  bb: string[] | null;
  z: number[] | null;
}>;

function ExampleQueries({ onPick }: { onPick: (patch: FilterPatch) => void }) {
  // Canonical Phase 5 examples. Some PLAN entries name specific
  // pitchers (Skubal, Cole) — those need pitcher IDs that aren't
  // user-knowable, so we cover the same shapes with broader filters
  // until the pitcher-picker lands.
  const examples: Array<{ label: string; patch: FilterPatch }> = [
    {
      label: "All sliders that got whiffs in 2025",
      patch: {
        pt: ["SL"],
        d: ["swinging_strike", "swinging_strike_blocked"],
        s: [2025],
      },
    },
    {
      label: "RHP fastballs to LHB on 2-strike counts",
      patch: {
        pt: ["FF"],
        pth: "R",
        bst: "L",
        c: ["0-2", "1-2", "2-2", "3-2"],
      },
    },
    {
      label: "Home runs off changeups, 2024",
      patch: { pt: ["CH"], ev: ["home_run"], s: [2024] },
    },
    {
      label: "Curveballs that ended ABs in strikeouts",
      patch: { pt: ["CU", "KC"], ev: ["strikeout"] },
    },
  ];
  return (
    <div className="rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/70">
        Try one of these
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {examples.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => onPick(ex.patch)}
            className="text-left text-sm px-3 py-2 rounded-md bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 transition-colors"
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── primitive form components ──────────────────────────────────────
function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3 pt-3 border-t border-white/[0.05] first:pt-0 first:border-t-0">
      <legend className="text-[10px] uppercase tracking-[0.16em] text-white/55">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

function ChipMulti<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<EnumOption<T>>;
  value: ReadonlyArray<T>;
  onChange: (next: T[]) => void;
}) {
  const selected = new Set(value);
  function toggle(v: T) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next));
  }
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-white/65">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const on = selected.has(opt.value);
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => toggle(opt.value)}
              aria-pressed={on}
              className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                on
                  ? "bg-white/[0.18] border-white/30 text-white"
                  : "bg-white/[0.04] border-white/10 text-white/65 hover:bg-white/[0.1] hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SegmentedSingle<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<EnumOption<T>>;
  value: T | null;
  onChange: (next: T | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-white/65">{label}</div>
      <div className="flex gap-1.5">
        {options.map((opt) => {
          const on = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(on ? null : opt.value)}
              aria-pressed={on}
              className={`flex-1 px-3 py-1 rounded border text-[11px] transition-colors ${
                on
                  ? "bg-white/[0.18] border-white/30 text-white"
                  : "bg-white/[0.04] border-white/10 text-white/65 hover:bg-white/[0.1] hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NumericListInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: number[];
  onChange: (next: number[]) => void;
  placeholder?: string;
  hint?: string;
}) {
  // Uncontrolled with a key reset: the local input state stays
  // disconnected from prop updates *until* the parent clears or
  // example-overwrites — the new array becomes a new key, the input
  // remounts, and the new defaultValue takes effect. Avoids the
  // useEffect-driven sync that the React Compiler flags.
  const formatted = value.join(", ");
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] text-white/65">{label}</span>
      <input
        key={formatted}
        type="text"
        defaultValue={formatted}
        onBlur={(e) => {
          const ids = e.target.value
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map(Number)
            .filter((n) => Number.isFinite(n));
          onChange(ids);
        }}
        placeholder={placeholder}
        className="w-full px-2 py-1 rounded bg-white/[0.04] border border-white/10 focus:border-white/30 focus:outline-none text-[12px] tabular-nums text-white/95 placeholder:text-white/30"
        inputMode="numeric"
      />
      {hint ? <span className="block text-[10px] text-white/45 leading-relaxed">{hint}</span> : null}
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] text-white/65">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 rounded bg-white/[0.04] border border-white/10 focus:border-white/30 focus:outline-none text-[12px] tabular-nums text-white/95"
      />
    </label>
  );
}
