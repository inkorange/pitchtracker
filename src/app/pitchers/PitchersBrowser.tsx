"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import {
  filterAndSort,
  findByPitch,
  fromWire,
  FIND_TYPES,
  PITCH_RANKS,
  SORT_COLUMNS,
  type DirectoryRow,
  type PitchFind,
  type PitchRankKey,
  type SortKey,
  type WireRow,
} from "@/lib/pitchers/directory-shapes";
import { pitcherPagePath } from "@/lib/url/pitcher-slug";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import { pitcherHeadshotUrl } from "@/lib/viz/headshot";
import { MixBar } from "@/components/pitch/MixBar";

// /pitchers — design/Pitchers.dc.html + PitchersMobile.dc.html.
// All state lives in the URL so any view is shareable.

const PAGE_SIZE = 50;
const MIN_PITCH_OPTIONS = [250, 500, 1000] as const;
const SORT_KEYS = SORT_COLUMNS.map((c) => c.key) as [SortKey, ...SortKey[]];
const RANK_KEYS = PITCH_RANKS.map((r) => r.key) as [PitchRankKey, ...PitchRankKey[]];

const params = {
  mode: parseAsStringLiteral(["all", "pitch"] as const).withDefault("all"),
  q: parseAsString.withDefault(""),
  team: parseAsInteger,
  hand: parseAsStringLiteral(["R", "L"] as const),
  role: parseAsStringLiteral(["SP", "RP"] as const),
  min: parseAsInteger.withDefault(500),
  sort: parseAsStringLiteral(SORT_KEYS).withDefault("k"),
  dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc"),
  page: parseAsInteger.withDefault(1),
  pt: parseAsStringLiteral(FIND_TYPES).withDefault("FC"),
  velo: parseAsInteger.withDefault(93),
  rank: parseAsStringLiteral(RANK_KEYS).withDefault("whiff"),
};

const fmt1 = (n: number | null) => (n == null ? "—" : n.toFixed(1));
const fmtInt = (n: number | null) => (n == null ? "—" : n.toLocaleString());

const SEG_ON = "bg-ink text-bg border-ink";
const SEG_OFF = "bg-transparent text-ink-2 border-line-strong hover:text-ink";

export function PitchersBrowser({
  rows: wire,
  teams,
}: {
  rows: WireRow[];
  teams: { id: number; abbr: string; name: string }[];
}) {
  const [s, set] = useQueryStates(params, { history: "replace" });
  const rows = useMemo(() => wire.map((r) => fromWire(r, pitcherPagePath)), [wire]);

  const filters = { q: s.q, team: s.team, hand: s.hand, role: s.role, minPitches: s.min };
  const sorted = useMemo(
    () => filterAndSort(rows, filters, s.sort, s.dir),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, s.q, s.team, s.hand, s.role, s.min, s.sort, s.dir],
  );
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(s.page, pages);
  const visible = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Any filter change resets to page 1.
  type Patch = Exclude<Parameters<typeof set>[0], ((old: typeof s) => unknown) | null>;
  const setFilter = (patch: Patch) => set({ ...patch, page: null });

  const finds = useMemo(
    () => (s.mode === "pitch" ? findByPitch(rows, s.pt, s.velo, s.rank) : []),
    [rows, s.mode, s.pt, s.velo, s.rank],
  );

  return (
    <div className="container-page flex flex-col gap-3 md:gap-4 pb-16">
      <div className="flex gap-2.5 items-center flex-wrap">
        <label htmlFor="pp-search" className="sr-only">
          Search pitchers
        </label>
        <input
          id="pp-search"
          type="search"
          value={s.q}
          onChange={(e) => setFilter({ q: e.target.value || null })}
          placeholder="Search by name — try “Miller”"
          className="flex-[1_1_320px] min-w-0 h-[50px] md:h-[52px] px-4 md:px-[18px] rounded-control border border-line-strong bg-surface text-ink text-base placeholder:text-muted focus:outline-none focus:border-ink-2"
        />
        <ModeTabs mode={s.mode} onChange={(mode) => set({ mode: mode === "all" ? null : mode })} />
      </div>

      {s.mode === "all" ? (
        <>
          {/* Filter bar */}
          <div className="flex gap-2.5 items-center max-md:flex-nowrap max-md:overflow-x-auto max-md:-mx-5 max-md:px-5 max-md:pb-1 scrollbar-thin md:flex-wrap md:px-3.5 md:py-3 md:bg-surface md:border md:border-line md:rounded-control [&>*]:shrink-0">
            <label className="label-caps flex items-center gap-2">
              Team
              <select
                value={s.team ?? ""}
                onChange={(e) => setFilter({ team: e.target.value ? Number(e.target.value) : null })}
                className="h-11 md:h-9 px-2.5 rounded-control border border-line-strong bg-bg-raised text-ink text-[13px] normal-case tracking-normal font-normal"
              >
                <option value="">All 30 teams</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.abbr} — {t.name}
                  </option>
                ))}
              </select>
            </label>
            <Divider />
            <Segmented
              label="Throws"
              value={s.hand}
              options={[
                [null, "All"],
                ["R", "RHP"],
                ["L", "LHP"],
              ]}
              onChange={(hand) => setFilter({ hand })}
            />
            <Divider />
            <Segmented
              label="Role"
              value={s.role}
              options={[
                [null, "All"],
                ["SP", "SP"],
                ["RP", "RP"],
              ]}
              onChange={(role) => setFilter({ role })}
            />
            <Divider />
            <label className="label-caps flex items-center gap-2">
              Min pitches
              <select
                value={s.min}
                onChange={(e) => setFilter({ min: Number(e.target.value) === 500 ? null : Number(e.target.value) })}
                className="h-11 md:h-9 px-2.5 rounded-control border border-line-strong bg-bg-raised text-ink text-[13px] normal-case tracking-normal font-normal"
              >
                {MIN_PITCH_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString()}+
                  </option>
                ))}
              </select>
            </label>
            <span className="hidden md:block grow" />
            <span className="hidden md:inline text-[13px] text-muted" aria-live="polite">
              Showing <span className="text-ink font-semibold">{sorted.length.toLocaleString()}</span> pitchers
            </span>
          </div>
          <span className="md:hidden text-[13px] text-muted" aria-live="polite">
            Showing <span className="text-ink font-semibold">{sorted.length.toLocaleString()}</span> pitchers
          </span>

          {/* Mobile sort pills */}
          <div className="md:hidden flex gap-1.5 overflow-x-auto scrollbar-thin -mx-5 px-5" role="group" aria-label="Sort by">
            {SORT_COLUMNS.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={s.sort === c.key}
                onClick={() => setFilter({ sort: c.key === "k" ? null : c.key, dir: null })}
                className={`shrink-0 h-10 px-3.5 rounded-full border text-[13px] font-semibold ${s.sort === c.key ? SEG_ON : SEG_OFF}`}
              >
                {c.short}
              </button>
            ))}
          </div>

          <DirectoryTable rows={visible} sort={s.sort} dir={s.dir} offset={(page - 1) * PAGE_SIZE} onSort={(key) => {
            const same = s.sort === key;
            const dir = same ? (s.dir === "desc" ? "asc" : "desc") : "desc";
            setFilter({ sort: key === "k" ? null : key, dir: dir === "desc" ? null : dir });
          }} />
          <DirectoryCards rows={visible} sort={s.sort} offset={(page - 1) * PAGE_SIZE} />

          <div className="flex justify-between items-center text-[13px] text-muted">
            <span>
              Page {page} of {pages}
              <span className="hidden md:inline"> · click a column to sort</span>
            </span>
            <div className="flex gap-1.5">
              <PagerButton disabled={page <= 1} onClick={() => set({ page: page - 1 === 1 ? null : page - 1 })}>
                ← Prev
              </PagerButton>
              <PagerButton disabled={page >= pages} onClick={() => set({ page: page + 1 })}>
                Next →
              </PagerButton>
            </div>
          </div>
          <p className="m-0 text-xs text-muted max-w-3xl">
            Whiff/swing % is misses per swing (pitch-weighted across a pitcher’s pitch types), which
            is larger than the per-pitch Whiff% on the homepage leaderboards. FB = four-seam, else
            sinker, else cutter. Season data through the end of the regular season.
          </p>
        </>
      ) : (
        <FindByPitch
          finds={finds}
          type={s.pt}
          velo={s.velo}
          rank={s.rank}
          onType={(pt) => set({ pt: pt === "FC" ? null : pt })}
          onVelo={(velo) => set({ velo: velo === 93 ? null : velo })}
          onRank={(rank) => set({ rank: rank === "whiff" ? null : rank })}
        />
      )}
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="hidden md:block w-px h-6 bg-line" />;
}

function ModeTabs({ mode, onChange }: { mode: "all" | "pitch"; onChange: (m: "all" | "pitch") => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabs = [
    ["all", "All pitchers"],
    ["pitch", "Find by pitch"],
  ] as const;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = mode === "all" ? "pitch" : "all";
    onChange(next);
    refs.current[next === "all" ? 0 : 1]?.focus();
    e.preventDefault();
  };
  return (
    <div
      role="tablist"
      aria-label="Mode"
      onKeyDown={onKey}
      className="flex w-full md:w-auto bg-surface border border-line rounded-control p-[3px] md:p-1"
    >
      {tabs.map(([id, label], i) => (
        <button
          key={id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          type="button"
          aria-selected={mode === id}
          tabIndex={mode === id ? 0 : -1}
          onClick={() => onChange(id)}
          className={`flex-1 md:flex-none h-10 md:h-[42px] px-[18px] rounded-[3px] text-sm ${
            mode === id ? "bg-ink text-bg font-bold" : "text-ink-2 font-semibold hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: [T | null, string][];
  onChange: (v: T | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="label-caps">{label}</span>
      <div role="group" aria-label={label} className="flex gap-1">
        {options.map(([v, l]) => (
          <button
            key={l}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`h-11 md:h-8 px-3 rounded-control border text-[13px] font-semibold ${value === v ? SEG_ON : SEG_OFF}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function PagerButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-11 md:h-9 px-3.5 rounded-control border border-line-strong text-[13px] text-ink enabled:hover:border-ink-2 disabled:text-muted disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Avatar({ id, size }: { id: number; size: number }) {
  return (
    <span className="relative block shrink-0 rounded-full bg-avatar overflow-hidden" style={{ width: size, height: size }}>
      <Image src={pitcherHeadshotUrl(id, 80)} alt="" fill sizes={`${size}px`} className="object-cover" unoptimized />
    </span>
  );
}


function metaLine(r: DirectoryRow) {
  return [r.team, r.hand ? `${r.hand}HP` : null, r.role].filter(Boolean).join(" · ");
}

const CELL: Record<SortKey, (r: DirectoryRow) => string> = {
  k: (r) => fmtInt(r.strikeouts),
  whiff: (r) => fmt1(r.whiffPerSwing),
  mph: (r) => fmt1(r.fbMph),
  spin: (r) => fmtInt(r.fbSpin),
  pitches: (r) => fmtInt(r.pitches),
};

function DirectoryTable({
  rows,
  sort,
  dir,
  offset,
  onSort,
}: {
  rows: DirectoryRow[];
  sort: SortKey;
  dir: "asc" | "desc";
  offset: number;
  onSort: (k: SortKey) => void;
}) {
  return (
    <div className="hidden md:block bg-surface border border-line rounded-control overflow-x-auto">
      <table className="w-full border-collapse text-sm min-w-[980px]">
        <caption className="sr-only">Pitchers, sorted by {SORT_COLUMNS.find((c) => c.key === sort)?.label}</caption>
        <thead>
          <tr className="bg-surface-2 border-b border-line">
            <th scope="col" className="w-10 pl-[18px] text-left label-caps">
              #
            </th>
            <th scope="col" className="text-left px-3 label-caps">
              Pitcher
            </th>
            {SORT_COLUMNS.map((c) => {
              const on = sort === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={on ? (dir === "desc" ? "descending" : "ascending") : "none"}
                  className="p-0 text-right"
                >
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    className={`w-full h-11 px-3 flex justify-end items-center gap-1 text-[11px] tracking-[1.2px] font-semibold uppercase ${
                      on ? "text-ink" : "text-muted hover:text-ink"
                    }`}
                  >
                    {c.label}
                    <span aria-hidden="true" className="text-accent w-2">
                      {on ? (dir === "desc" ? "↓" : "↑") : ""}
                    </span>
                  </button>
                </th>
              );
            })}
            <th scope="col" className="text-left px-3 label-caps">
              Arsenal mix
            </th>
            <th scope="col" className="w-12">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-line hover:bg-surface-2/60">
              <td className="pl-[18px] font-display font-bold text-lg text-muted num">{offset + i + 1}</td>
              <th scope="row" className="text-left px-3 py-2.5 font-medium">
                <Link href={r.href} className="flex items-center gap-3 text-ink hover:text-accent-hover">
                  <Avatar id={r.id} size={36} />
                  <span className="flex flex-col min-w-0">
                    <span className="font-semibold truncate">{r.name}</span>
                    <span className="text-xs text-muted">{metaLine(r)}</span>
                  </span>
                </Link>
              </th>
              {SORT_COLUMNS.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2.5 text-right num ${
                    sort === c.key ? "font-display font-bold text-[19px] text-ink" : "text-ink-2"
                  }`}
                >
                  {CELL[c.key](r)}
                </td>
              ))}
              <td className="px-3 py-2.5">
                <MixBar mix={r.mix} width={140} />
              </td>
              <td className="px-3 py-2.5 text-right">
                <Link
                  href={r.href}
                  aria-label={`Open ${r.name} in 3D`}
                  className="size-9 rounded-full bg-accent hover:bg-accent-hover inline-flex items-center justify-center"
                >
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="#fff">
                    <path d="M7 4l13 8-13 8z" />
                  </svg>
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-[18px] py-10 text-center text-muted">
                No pitchers match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function DirectoryCards({ rows, sort, offset }: { rows: DirectoryRow[]; sort: SortKey; offset: number }) {
  const col = SORT_COLUMNS.find((c) => c.key === sort)!;
  return (
    <ol className="md:hidden list-none m-0 p-0 flex flex-col gap-2">
      {rows.map((r, i) => (
        <li key={r.id}>
          <Link
            href={r.href}
            className="flex items-center gap-3 px-3.5 py-3 bg-surface border border-line rounded-control text-ink hover:text-ink"
          >
            <span className="w-[22px] font-display font-bold text-lg text-muted num">{offset + i + 1}</span>
            <Avatar id={r.id} size={40} />
            <span className="grow min-w-0 flex flex-col gap-[5px]">
              <span className="font-semibold text-[15px] truncate">{r.name}</span>
              <span className="text-xs text-muted">{metaLine(r)}</span>
              <MixBar mix={r.mix} width={120} height={5} />
            </span>
            <span className="flex flex-col items-end">
              <span className="font-display font-bold text-[26px] leading-none num">{CELL[sort](r)}</span>
              <span className="text-[10px] tracking-[1px] text-muted font-semibold uppercase">{col.short}</span>
            </span>
          </Link>
        </li>
      ))}
      {rows.length === 0 ? <li className="py-8 text-center text-muted">No pitchers match these filters.</li> : null}
    </ol>
  );
}

function FindByPitch({
  finds,
  type,
  velo,
  rank,
  onType,
  onVelo,
  onRank,
}: {
  finds: PitchFind[];
  type: (typeof FIND_TYPES)[number];
  velo: number;
  rank: PitchRankKey;
  onType: (t: (typeof FIND_TYPES)[number]) => void;
  onVelo: (v: number) => void;
  onRank: (r: PitchRankKey) => void;
}) {
  const color = getPitchColor(type);
  const typeName = getPitchLabel(type);
  return (
    <>
      <div className="flex flex-col gap-3.5 p-4 md:p-[18px] bg-surface border border-line rounded-control">
        <span className="label-caps">1 · Pick a pitch type</span>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Pitch type">
          {FIND_TYPES.map((t) => {
            const on = t === type;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => onType(t)}
                className={`h-11 md:h-10 px-3.5 rounded-full text-sm font-semibold flex items-center gap-2 border ${
                  on ? "bg-surface-2 text-ink border-[1.5px]" : "text-ink-2 border-line-strong hover:text-ink"
                }`}
                style={on ? { borderColor: getPitchColor(t) } : undefined}
              >
                <span aria-hidden="true" className="size-[9px] rounded-full" style={{ background: getPitchColor(t) }} />
                {getPitchLabel(t)}
              </button>
            );
          })}
        </div>
        <div className="flex gap-8 flex-wrap items-end">
          <div className="flex flex-col gap-2">
            <span className="label-caps" id="velo-label">
              2 · Min velocity
            </span>
            <div className="flex items-center gap-2" role="group" aria-labelledby="velo-label">
              <button
                type="button"
                aria-label="Lower minimum velocity"
                onClick={() => onVelo(Math.max(70, velo - 1))}
                className="size-11 md:size-10 rounded-control border border-line-strong text-ink text-lg"
              >
                −
              </button>
              <span className="font-display font-bold text-[30px] w-24 text-center num" aria-live="polite">
                {velo}+ <span className="text-[15px] text-muted">MPH</span>
              </span>
              <button
                type="button"
                aria-label="Raise minimum velocity"
                onClick={() => onVelo(Math.min(103, velo + 1))}
                className="size-11 md:size-10 rounded-control border border-line-strong text-ink text-lg"
              >
                +
              </button>
            </div>
          </div>
          <label className="flex flex-col gap-2">
            <span className="label-caps">3 · Rank by</span>
            <select
              value={rank}
              onChange={(e) => onRank(e.target.value as PitchRankKey)}
              className="h-11 md:h-10 px-3 rounded-control border border-line-strong bg-bg-raised text-ink text-sm"
            >
              {PITCH_RANKS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <span className="grow" />
          <span className="text-[13px] text-muted" aria-live="polite">
            {finds.length.toLocaleString()} pitchers throw a {typeName.toLowerCase()} at {velo}+
          </span>
        </div>
      </div>

      <ol className="list-none m-0 p-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {finds.slice(0, 30).map((f, i) => (
          <li key={f.row.id}>
            <Link
              href={f.row.href}
              className="flex flex-col gap-3 px-[18px] py-4 bg-surface border border-line border-l-4 rounded-control text-ink hover:text-ink hover:border-line-strong"
              style={{ borderLeftColor: color }}
            >
              <div className="flex items-center gap-3">
                {/* Headshot with the rank as a badge on its lower-left
                    edge, keyed to the selected pitch type's color. */}
                <span className="relative shrink-0">
                  <Avatar id={f.row.id} size={64} />
                  <span
                    className="absolute -bottom-1 -left-1.5 min-w-[28px] h-7 px-1.5 rounded-full border-2 border-surface flex items-center justify-center font-display font-extrabold text-[17px] leading-none text-bg num"
                    style={{ background: color }}
                  >
                    <span className="sr-only">Rank </span>
                    {i + 1}
                  </span>
                </span>
                <span className="flex flex-col grow min-w-0">
                  <span className="font-display font-bold text-[22px] leading-[1.1] truncate">{f.row.name}</span>
                  <span className="text-xs text-muted">
                    {[f.row.team, f.row.hand ? `${f.row.hand}HP` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <BreakGlyph hBreak={f.line.hBreak} ivb={f.line.ivb} color={color} />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <MiniStat k="MPH" v={fmt1(f.line.mph)} />
                <MiniStat k="Usage" v={`${Math.round(f.line.usage)}%`} />
                <MiniStat k="Whiff/sw" v={fmt1(f.line.whiffPerSwing)} />
                <MiniStat k="Spin" v={fmtInt(f.line.spin)} />
              </div>
            </Link>
          </li>
        ))}
      </ol>
      {finds.length === 0 ? (
        <p className="text-center text-muted py-8">No pitchers throw a {typeName.toLowerCase()} at {velo}+ mph (50+ thrown).</p>
      ) : null}
    </>
  );
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[10px] tracking-[1px] text-muted font-semibold uppercase">{k}</span>
      <span className="font-display font-bold text-xl num">{v}</span>
    </span>
  );
}

/** Tiny schematic of the pitch's movement: horizontal break bends the
 *  path sideways, induced vertical break lifts or drops its end. */
function BreakGlyph({ hBreak, ivb, color }: { hBreak: number | null; ivb: number | null; color: string }) {
  const hx = Math.max(-1, Math.min(1, (hBreak ?? 0) / 20));
  const vy = Math.max(-1, Math.min(1, (ivb ?? 0) / 20));
  const endX = 50 + hx * 24;
  const endY = 20 - vy * 14;
  return (
    <svg aria-hidden="true" viewBox="0 0 80 40" width="80" height="40" className="shrink-0">
      <circle cx={8} cy={20} r={3} fill="var(--text)" />
      <path d={`M8 20 Q 40 20 ${endX} ${endY}`} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
    </svg>
  );
}
