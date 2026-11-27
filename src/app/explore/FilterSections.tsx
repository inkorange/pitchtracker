"use client";

import type { ReactNode } from "react";
import { MultiPersonPicker } from "@/components/search/MultiPersonPicker";
import { BATTED_BALL_TYPES, EVENTS, PITCH_TYPES } from "@/lib/savant/enums";
import {
  CHASE_ZONES,
  COUNT_PRESETS,
  describeCodes,
  describeCounts,
  describeZones,
  EVENT_GROUPS,
  GAME_TYPE_OPTIONS,
  gameTypeLabel,
  groupOn,
  IN_ZONE,
  PITCH_GROUPS,
  RESULT_GROUPS,
  sameSet,
  toggleGroup,
  toggleOne,
  type ExploreFilters,
} from "@/lib/explore/query";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";

// The four filter sections of /explore — design/Explore.dc.html.
// Each exports a body and a one-line summary; ExploreClient renders
// them as accordions (desktop) or tabs in the mobile filter sheet.

export type SectionKey = "who" | "what" | "when" | "outcome";
export type Patch = Partial<{ [K in keyof ExploreFilters]: ExploreFilters[K] | null }>;

export interface SectionProps {
  f: ExploreFilters;
  set: (patch: Patch) => void;
  seasons: number[];
  onPitcherNames: (m: Map<number, string>) => void;
  onBatterNames: (m: Map<number, string>) => void;
  showAllEvents: boolean;
  setShowAllEvents: (v: boolean) => void;
}

const nullIfEmpty = <T,>(xs: T[]) => (xs.length ? xs : null);
const EVENT_LABEL = new Map(EVENTS.map((e) => [e.value, e.label]));

// ── primitives ────────────────────────────────────────────────────────
export function Chip({
  on,
  onClick,
  children,
  color,
  label,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  color?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={`h-11 md:h-9 px-3 rounded-full border text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
        on ? "bg-ink text-bg border-ink" : "text-ink-2 border-line-strong hover:text-ink hover:border-ink-2"
      }`}
    >
      {color ? <span aria-hidden="true" className="size-[9px] rounded-full" style={{ background: color }} /> : null}
      {children}
    </button>
  );
}

function Field({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2 min-h-7">
        <span className="label-caps">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="h-7 px-1 text-xs font-semibold text-accent-hover hover:text-ink">
      {children}
    </button>
  );
}

function Segmented({
  value,
  onChange,
  options,
  label,
}: {
  value: "L" | "R" | null;
  onChange: (v: "L" | "R" | null) => void;
  options: [string, string];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5">
      {(["L", "R"] as const).map((h, i) => (
        <Chip key={h} on={value === h} onClick={() => onChange(value === h ? null : h)}>
          {options[i]}
        </Chip>
      ))}
    </div>
  );
}

// ── Who ───────────────────────────────────────────────────────────────
export function WhoBody({ f, set, onPitcherNames, onBatterNames }: SectionProps) {
  return (
    <>
      <MultiPersonPicker
        kind="pitcher"
        label="Pitchers"
        placeholder="Add pitcher…"
        value={f.pid}
        onChange={(v) => set({ pid: nullIfEmpty(v) })}
        onNames={onPitcherNames}
      />
      <MultiPersonPicker
        kind="batter"
        label="Batters"
        placeholder="Search a batter by name"
        value={f.bid}
        onChange={(v) => set({ bid: nullIfEmpty(v) })}
        onNames={onBatterNames}
      />
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Pitcher throws">
          <Segmented label="Pitcher throws" value={f.pth} onChange={(v) => set({ pth: v })} options={["LHP", "RHP"]} />
        </Field>
        <Field label="Batter stands">
          <Segmented label="Batter stands" value={f.bst} onChange={(v) => set({ bst: v })} options={["LHB", "RHB"]} />
        </Field>
      </div>
    </>
  );
}

export function whoSummary(f: ExploreFilters, pitcherName: (id: number) => string, batterName: (id: number) => string) {
  const parts = [
    f.pid.length ? (f.pid.length === 1 ? pitcherName(f.pid[0]) : `${f.pid.length} pitchers`) : null,
    f.pth ? `${f.pth}HP` : null,
    f.bid.length ? `vs ${f.bid.length === 1 ? batterName(f.bid[0]) : `${f.bid.length} batters`}` : f.bst ? `vs ${f.bst}HB` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "Any pitcher, any batter";
}

// ── What ──────────────────────────────────────────────────────────────
const PT_LABEL = new Map(PITCH_TYPES.map((p) => [p.value, p.label]));

export function WhatBody({ f, set }: SectionProps) {
  return (
    <>
      {PITCH_GROUPS.map((g) => (
        <Field
          key={g.label}
          label={g.label}
          action={
            <LinkButton onClick={() => set({ pt: nullIfEmpty(toggleGroup(f.pt, g.codes)) })}>
              {groupOn(f.pt, g.codes) ? "Clear" : "Select all"}
            </LinkButton>
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {g.codes.map((c) => (
              <Chip key={c} on={f.pt.includes(c)} color={getPitchColor(c)} onClick={() => set({ pt: nullIfEmpty(toggleOne(f.pt, c)) })}>
                {PT_LABEL.get(c) ?? getPitchLabel(c)}
              </Chip>
            ))}
          </div>
        </Field>
      ))}
    </>
  );
}

export function whatSummary(f: ExploreFilters) {
  return f.pt.length ? describeCodes(f.pt, PITCH_GROUPS, (c) => getPitchLabel(c)).join(", ") : "Every pitch type";
}

// ── When ──────────────────────────────────────────────────────────────
export function WhenBody({ f, set, seasons }: SectionProps) {
  const gtKey = GAME_TYPE_OPTIONS.findIndex((o) => sameSet(o.codes, f.gt));
  return (
    <>
      <Field label="Seasons">
        <div className="flex flex-wrap gap-1.5">
          {seasons.map((y) => (
            <Chip key={y} on={f.s.includes(y)} onClick={() => set({ s: nullIfEmpty(toggleOne(f.s, y)) })}>
              {y}
            </Chip>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        {(
          [
            ["From", "df"],
            ["To", "dt"],
          ] as const
        ).map(([label, key]) => (
          <label key={key} className="flex flex-col gap-1.5">
            <span className="label-caps">{label}</span>
            <input
              type="date"
              value={f[key] ?? ""}
              onChange={(e) => set({ [key]: e.target.value || null })}
              className="h-11 px-2.5 rounded-control border border-line-strong bg-bg text-ink text-sm num [color-scheme:dark]"
            />
          </label>
        ))}
      </div>
      <Field label="Count · balls across, strikes down">
        <div className="flex flex-wrap gap-1.5">
          {COUNT_PRESETS.map((p) => (
            <Chip key={p.label} on={sameSet(f.c, p.codes)} onClick={() => set({ c: sameSet(f.c, p.codes) ? null : p.codes })}>
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-[28px_repeat(4,minmax(0,1fr))] gap-1.5 items-center mt-1" role="group" aria-label="Counts">
          <span />
          {[0, 1, 2, 3].map((b) => (
            <span key={b} className="label-caps text-center">
              {b}
            </span>
          ))}
          {[0, 1, 2].map((st) => (
            <CountRow key={st} strikes={st} f={f} set={set} />
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Outs">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((o) => (
              <Chip key={o} on={f.o.includes(o)} onClick={() => set({ o: nullIfEmpty(toggleOne(f.o, o)) })}>
                {o}
              </Chip>
            ))}
          </div>
        </Field>
        <label className="flex flex-col gap-2">
          <span className="label-caps min-h-7 flex items-center">Game type</span>
          <select
            value={gtKey}
            onChange={(e) => set({ gt: GAME_TYPE_OPTIONS[Number(e.target.value)]?.codes ?? ["R"] })}
            className="select-chevron h-11 md:h-9 pl-2.5 rounded-control border border-line-strong bg-bg text-ink text-[13px]"
          >
            {gtKey === -1 ? <option value={-1}>Custom</option> : null}
            {GAME_TYPE_OPTIONS.map((o, i) => (
              <option key={o.label} value={i}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

function CountRow({ strikes, f, set }: { strikes: number; f: ExploreFilters; set: (p: Patch) => void }) {
  return (
    <>
      <span className="label-caps text-center">{strikes}</span>
      {[0, 1, 2, 3].map((b) => {
        const k = `${b}-${strikes}`;
        const on = f.c.includes(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            aria-label={`${b} balls, ${strikes} strikes`}
            onClick={() => set({ c: nullIfEmpty(toggleOne(f.c, k)) })}
            className={`h-11 md:h-9 rounded-control border font-display font-bold text-base num ${
              on ? "bg-ink text-bg border-ink" : "text-ink-2 border-line-strong hover:text-ink"
            }`}
          >
            {k}
          </button>
        );
      })}
    </>
  );
}

export function whenSummary(f: ExploreFilters) {
  const parts = [
    f.s.length ? [...f.s].sort((a, b) => b - a).join(", ") : "All seasons",
    f.df || f.dt ? "date range" : null,
    describeCounts(f.c),
    f.o.length ? `${f.o.join("/")} out` : null,
    sameSet(f.gt, ["R"]) ? null : gameTypeLabel(f.gt),
  ].filter(Boolean);
  return parts.join(" · ");
}

// ── Outcome ───────────────────────────────────────────────────────────
export function OutcomeBody({ f, set, showAllEvents, setShowAllEvents }: SectionProps) {
  return (
    <>
      <Field label="Pitch result">
        <div className="flex flex-wrap gap-1.5">
          {RESULT_GROUPS.map((g) => (
            <Chip key={g.label} on={groupOn(f.d, g.codes)} onClick={() => set({ d: nullIfEmpty(toggleGroup(f.d, g.codes)) })}>
              {g.label}
            </Chip>
          ))}
        </div>
        <span className="text-xs text-muted">
          Groups expand to Statcast’s raw results (Whiff = swinging strike + blocked + foul tip).
        </span>
      </Field>
      <Field
        label="At-bat result"
        action={
          <LinkButton onClick={() => setShowAllEvents(!showAllEvents)}>{showAllEvents ? "Fewer" : "More…"}</LinkButton>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {showAllEvents
            ? EVENTS.map((e) => (
                <Chip key={e.value} on={f.ev.includes(e.value)} onClick={() => set({ ev: nullIfEmpty(toggleOne(f.ev, e.value)) })}>
                  {e.label}
                </Chip>
              ))
            : EVENT_GROUPS.map((g) => (
                <Chip key={g.label} on={groupOn(f.ev, g.codes)} onClick={() => set({ ev: nullIfEmpty(toggleGroup(f.ev, g.codes)) })}>
                  {g.label}
                </Chip>
              ))}
        </div>
      </Field>
      <Field label="Batted ball">
        <div className="flex flex-wrap gap-1.5">
          {BATTED_BALL_TYPES.map((b) => (
            <Chip key={b.value} on={f.bb.includes(b.value)} onClick={() => set({ bb: nullIfEmpty(toggleOne(f.bb, b.value)) })}>
              {b.label}
            </Chip>
          ))}
        </div>
      </Field>
      <div className="flex gap-[18px] items-start flex-wrap">
        <Field label="Zone · catcher view">
          <ZonePicker value={f.z} onChange={(z) => set({ z: nullIfEmpty(z) })} />
        </Field>
        <div className="flex flex-col gap-2 pt-9 text-xs leading-normal text-muted max-w-[170px]">
          <span>Pick zones 1–9; the corners are chase zones 11–14.</span>
          <div className="flex flex-wrap gap-1.5">
            <Chip on={sameSet(f.z, IN_ZONE)} onClick={() => set({ z: sameSet(f.z, IN_ZONE) ? null : IN_ZONE })}>
              In zone
            </Chip>
            <Chip on={sameSet(f.z, CHASE_ZONES)} onClick={() => set({ z: sameSet(f.z, CHASE_ZONES) ? null : CHASE_ZONES })}>
              Chase
            </Chip>
            <Chip on={false} onClick={() => set({ z: null })}>
              Clear
            </Chip>
          </div>
        </div>
      </div>
    </>
  );
}

/** 3×3 strike zone (1–9) inside four chase quadrants (11–14). */
function ZonePicker({ value, onChange }: { value: number[]; onChange: (z: number[]) => void }) {
  const cell = (n: number, extra = "") => {
    const on = value.includes(n);
    return (
      <button
        key={n}
        type="button"
        aria-pressed={on}
        aria-label={`Zone ${n}${n > 10 ? " (chase)" : ""}`}
        onClick={() => onChange(toggleOne(value, n))}
        className={`font-display font-bold text-sm flex ${extra} ${
          on ? "bg-accent text-white" : "bg-bg text-ink-2 hover:bg-surface-2 hover:text-ink"
        }`}
      >
        {n}
      </button>
    );
  };
  return (
    <div role="group" aria-label="Strike zone picker" className="relative w-[200px] h-[240px] rounded-control overflow-hidden border border-line-strong">
      {/* Chase quadrants fill the box; labels sit in their outer corners. */}
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-line">
        {cell(11, "items-start justify-start p-1.5")}
        {cell(12, "items-start justify-end p-1.5")}
        {cell(13, "items-end justify-start p-1.5")}
        {cell(14, "items-end justify-end p-1.5")}
      </div>
      <div className="absolute left-[40px] top-[45px] w-[120px] h-[150px] grid grid-cols-3 grid-rows-3 gap-px bg-line border-2 border-ink-2">
        {IN_ZONE.map((n) => cell(n, "items-center justify-center"))}
      </div>
    </div>
  );
}

export function outcomeSummary(f: ExploreFilters) {
  const parts = [
    ...describeCodes(f.d, RESULT_GROUPS, (c) => c.replace(/_/g, " ")),
    ...describeCodes(f.ev, EVENT_GROUPS, (c) => EVENT_LABEL.get(c) ?? c),
    ...f.bb.map((b) => b.replace(/_/g, " ")),
    describeZones(f.z),
  ].filter(Boolean);
  return parts.join(" · ") || "Any outcome";
}

