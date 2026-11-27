// Filter vocabulary for the redesigned /explore (design/Explore.dc.html).
// The URL keeps the raw Statcast codes (so old share links still work);
// these helpers group them into the friendlier controls the design uses.

export interface ExploreFilters {
  pid: number[];
  bid: number[];
  pth: "L" | "R" | null;
  bst: "L" | "R" | null;
  pt: string[];
  s: number[];
  df: string | null;
  dt: string | null;
  c: string[];
  o: number[];
  inn: number[];
  gt: string[];
  d: string[];
  ev: string[];
  bb: string[];
  z: number[];
}

export interface CodeGroup<T extends string | number = string> {
  label: string;
  codes: T[];
}

// ── What ──────────────────────────────────────────────────────────────
export const PITCH_GROUPS: CodeGroup[] = [
  { label: "Fastballs", codes: ["FF", "SI", "FC", "FA"] },
  { label: "Breaking", codes: ["SL", "ST", "SV", "CU", "KC", "CS"] },
  { label: "Offspeed", codes: ["CH", "FS", "FO", "SC"] },
  { label: "Other", codes: ["KN", "EP", "UN"] },
];

// ── When ──────────────────────────────────────────────────────────────
/** Every count, balls-strikes. */
export const ALL_COUNTS = [0, 1, 2, 3].flatMap((b) => [0, 1, 2].map((s) => `${b}-${s}`));

export const COUNT_PRESETS: (CodeGroup & { phrase: string })[] = [
  { label: "First pitch", codes: ["0-0"], phrase: "the first pitch" },
  // Ahead / behind from the pitcher's side.
  { label: "Ahead", codes: ["0-1", "0-2", "1-2"], phrase: "pitcher-ahead counts" },
  { label: "Even", codes: ["0-0", "1-1", "2-2"], phrase: "even counts" },
  { label: "Behind", codes: ["1-0", "2-0", "3-0", "2-1", "3-1"], phrase: "pitcher-behind counts" },
  { label: "2 strikes", codes: ["0-2", "1-2", "2-2", "3-2"], phrase: "two-strike counts" },
  { label: "3 balls", codes: ["3-0", "3-1", "3-2"], phrase: "three-ball counts" },
];

export const GAME_TYPE_OPTIONS: CodeGroup[] = [
  { label: "Regular season", codes: ["R"] },
  { label: "Postseason (all)", codes: ["F", "D", "L", "W"] },
  { label: "Regular + postseason", codes: ["R", "F", "D", "L", "W"] },
  { label: "Wild card", codes: ["F"] },
  { label: "Division series", codes: ["D"] },
  { label: "League championship", codes: ["L"] },
  { label: "World Series", codes: ["W"] },
  { label: "Spring training", codes: ["S"] },
];

// ── Outcome ───────────────────────────────────────────────────────────
export const RESULT_GROUPS: CodeGroup[] = [
  { label: "Whiff", codes: ["swinging_strike", "swinging_strike_blocked", "foul_tip", "missed_bunt"] },
  { label: "Called strike", codes: ["called_strike"] },
  { label: "Foul", codes: ["foul", "foul_bunt"] },
  { label: "Ball", codes: ["ball", "blocked_ball", "pitchout"] },
  { label: "In play", codes: ["hit_into_play"] },
  { label: "HBP", codes: ["hit_by_pitch"] },
];

export const EVENT_GROUPS: CodeGroup[] = [
  { label: "Hits", codes: ["single", "double", "triple", "home_run"] },
  { label: "Home runs", codes: ["home_run"] },
  { label: "Walks & HBP", codes: ["walk", "intent_walk", "hit_by_pitch"] },
  { label: "Strikeouts", codes: ["strikeout", "strikeout_double_play"] },
  {
    label: "Outs in play",
    codes: ["field_out", "force_out", "fielders_choice_out", "grounded_into_double_play", "double_play", "triple_play"],
  },
];

export const IN_ZONE = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const CHASE_ZONES = [11, 12, 13, 14];

// ── group helpers ─────────────────────────────────────────────────────
export function groupOn<T extends string | number>(selected: readonly T[], codes: readonly T[]): boolean {
  return codes.length > 0 && codes.every((c) => selected.includes(c));
}

/** Toggle a whole group: add all its codes, or remove them all. */
export function toggleGroup<T extends string | number>(selected: readonly T[], codes: readonly T[]): T[] {
  if (groupOn(selected, codes)) return selected.filter((c) => !codes.includes(c));
  return [...selected, ...codes.filter((c) => !selected.includes(c))];
}

export function toggleOne<T extends string | number>(selected: readonly T[], code: T): T[] {
  return selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code];
}

export function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** The game-type option that exactly matches `gt`, if any. */
export function gameTypeLabel(gt: readonly string[]): string {
  return GAME_TYPE_OPTIONS.find((o) => sameSet(o.codes, gt))?.label ?? (gt.length ? "Custom" : "Any game");
}

/** Name the selection with groups where it matches them exactly. */
export function describeCodes(selected: readonly string[], groups: CodeGroup[], labelOf: (c: string) => string): string[] {
  const out: string[] = [];
  let rest = [...selected];
  for (const g of groups) {
    if (g.codes.length > 1 && groupOn(rest, g.codes)) {
      out.push(g.label);
      rest = rest.filter((c) => !g.codes.includes(c));
    }
  }
  return [...out, ...rest.map(labelOf)];
}

export function describeCounts(c: readonly string[]): string | null {
  if (c.length === 0) return null;
  const preset = COUNT_PRESETS.find((p) => sameSet(p.codes, c));
  if (preset) return preset.phrase;
  return c.length <= 3 ? c.join(", ") : `${c.length} counts`;
}

export function describeZones(z: readonly number[]): string | null {
  if (z.length === 0) return null;
  if (sameSet(z, IN_ZONE)) return "the zone";
  if (sameSet(z, CHASE_ZONES)) return "chase zones";
  return `zones ${[...z].sort((a, b) => a - b).join(", ")}`;
}

export interface SentencePart {
  pre: string;
  v: string;
}

/** "PITCHES by [who] · [types] vs [side] in [season] in [counts] → [results] in [zones]". */
export function querySentence(
  f: ExploreFilters,
  names: { pitchers: (id: number) => string; batters: (id: number) => string; pitchLabel: (c: string) => string },
): SentencePart[] {
  const parts: SentencePart[] = [];
  const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" & ") : `${xs.slice(0, 2).join(", ")} +${xs.length - 2}`);
  parts.push({ pre: "by", v: f.pid.length ? list(f.pid.map(names.pitchers)) : f.pth ? `any ${f.pth}HP` : "anyone" });
  if (f.pid.length && f.pth) parts.push({ pre: "·", v: `${f.pth}HP` });
  if (f.pt.length) parts.push({ pre: "·", v: list(describeCodes(f.pt, PITCH_GROUPS, names.pitchLabel)) });
  if (f.bid.length) parts.push({ pre: "vs", v: list(f.bid.map(names.batters)) });
  else if (f.bst) parts.push({ pre: "vs", v: `${f.bst}HB` });
  if (f.s.length) parts.push({ pre: "in", v: [...f.s].sort((a, b) => b - a).join(", ") });
  if (f.df || f.dt) parts.push({ pre: "from", v: `${f.df ?? "…"} to ${f.dt ?? "…"}` });
  const counts = describeCounts(f.c);
  if (counts) parts.push({ pre: "in", v: counts });
  if (f.o.length) parts.push({ pre: "with", v: `${[...f.o].sort().join(" or ")} out${f.o.length === 1 && f.o[0] === 1 ? "" : "s"}` });
  if (!sameSet(f.gt, ["R"])) parts.push({ pre: "in", v: gameTypeLabel(f.gt).toLowerCase() });
  const results = describeCodes(f.d, RESULT_GROUPS, (c) => c.replace(/_/g, " "));
  const events = describeCodes(f.ev, EVENT_GROUPS, (c) => c.replace(/_/g, " "));
  const outcomes = [...results, ...events, ...f.bb.map((b) => b.replace(/_/g, " "))];
  if (outcomes.length) parts.push({ pre: "→", v: list(outcomes) });
  const zones = describeZones(f.z);
  if (zones) parts.push({ pre: "in", v: zones });
  return parts;
}

/** How many filter controls are set (for the mobile "Edit filters (n)" badge). */
export function activeFilterCount(f: ExploreFilters): number {
  return [
    f.pid.length,
    f.bid.length,
    f.pth,
    f.bst,
    f.pt.length,
    f.s.length,
    f.df || f.dt,
    f.c.length,
    f.o.length,
    f.inn.length,
    !sameSet(f.gt, ["R"]),
    f.d.length,
    f.ev.length,
    f.bb.length,
    f.z.length,
  ].filter(Boolean).length;
}

/** Where a pitch crossed the plate, as a Statcast-style zone code. */
export function zoneFor(plateX: number | null, plateZ: number | null): number | null {
  if (plateX == null || plateZ == null) return null;
  const X0 = -0.83;
  const X1 = 0.83;
  const Z0 = 1.5;
  const Z1 = 3.5;
  if (plateX >= X0 && plateX <= X1 && plateZ >= Z0 && plateZ <= Z1) {
    // Catcher's view: zone 1 is high and to the catcher's left (-x).
    const col = Math.min(2, Math.floor(((plateX - X0) / (X1 - X0)) * 3));
    const row = Math.min(2, Math.floor(((Z1 - plateZ) / (Z1 - Z0)) * 3));
    return row * 3 + col + 1;
  }
  const high = plateZ > (Z0 + Z1) / 2;
  const left = plateX < 0;
  return high ? (left ? 11 : 12) : left ? 13 : 14;
}
