// Pure shapes + row building for the /pitchers directory. The loader
// (directory.ts) is server-only; this module is shared with the client
// table and tests.
//
// DATA CAVEAT — read before adding columns:
// pitch_pitcher_aggregates.whiff_rate is misses PER SWING, per pitch
// type. The homepage leaderboards' Whiff% / CSW% are per PITCH (from
// pitch_rankings) and can't be derived from these rows (no swing
// counts). So the directory shows "Whiff/swing %", and its pitcher-level
// value is a pitch-count-weighted average of the per-type rates — an
// approximation, since the exact weight would be swings per type.

export interface PitchTypeLine {
  type: string;
  count: number;
  /** Share of the pitcher's pitches, 0–100. */
  usage: number;
  mph: number | null;
  spin: number | null;
  /** Inches, pitcher's-arm-side positive (as stored). */
  hBreak: number | null;
  /** Induced vertical break, inches. */
  ivb: number | null;
  /** Misses per swing, 0–100. */
  whiffPerSwing: number | null;
}

export type Role = "SP" | "RP";

export interface DirectoryRow {
  id: number;
  name: string;
  href: string;
  teamId: number | null;
  team: string | null;
  /** "R" | "L" | null */
  hand: string | null;
  role: Role | null;
  strikeouts: number | null;
  pitches: number;
  whiffPerSwing: number | null;
  fbMph: number | null;
  fbSpin: number | null;
  /** Most-used first. */
  mix: PitchTypeLine[];
}

export interface AggregateInput {
  pitch_type: string;
  pitch_count: number | null;
  usage_pct: number | null;
  avg_velocity: number | null;
  avg_spin_rate: number | null;
  avg_horizontal_break: number | null;
  avg_induced_vertical_break: number | null;
  whiff_rate: number | null;
}

/** Primary fastball: four-seam, else sinker, else cutter. */
const FASTBALL_ORDER = ["FF", "FA", "SI", "FT", "FC"];

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildPitchLines(rows: AggregateInput[]): PitchTypeLine[] {
  return rows
    // Skip empty-count rows and rows with no pitch-type code (some
    // aggregates carry pitch_type '').
    .filter((r) => (r.pitch_count ?? 0) > 0 && r.pitch_type.trim() !== "")
    .map((r) => ({
      type: r.pitch_type,
      count: r.pitch_count ?? 0,
      usage: r.usage_pct ?? 0,
      mph: r.avg_velocity,
      spin: r.avg_spin_rate,
      hBreak: r.avg_horizontal_break,
      ivb: r.avg_induced_vertical_break,
      whiffPerSwing: r.whiff_rate,
    }))
    .sort((a, b) => b.count - a.count);
}

export function summarizeLines(mix: PitchTypeLine[]): {
  pitches: number;
  whiffPerSwing: number | null;
  fbMph: number | null;
  fbSpin: number | null;
} {
  const pitches = mix.reduce((s, l) => s + l.count, 0);
  const rated = mix.filter((l) => l.whiffPerSwing != null);
  const ratedN = rated.reduce((s, l) => s + l.count, 0);
  const whiffPerSwing =
    ratedN > 0 ? r1(rated.reduce((s, l) => s + (l.whiffPerSwing as number) * l.count, 0) / ratedN) : null;
  const fb = FASTBALL_ORDER.map((t) => mix.find((l) => l.type === t)).find(Boolean);
  return { pitches, whiffPerSwing, fbMph: fb?.mph ?? null, fbSpin: fb?.spin ?? null };
}

/** SP when at least half of a pitcher's appearances (and 3+) were starts. */
export function roleFor(gamesStarted: number, gamesPitched: number): Role | null {
  if (gamesPitched <= 0) return null;
  return gamesStarted >= 3 && gamesStarted * 2 >= gamesPitched ? "SP" : "RP";
}

// ---------------------------------------------------------------------
// Table state helpers (pure, shared by the client table and tests)
// ---------------------------------------------------------------------

export type SortKey = "k" | "whiff" | "mph" | "spin" | "pitches";

export const SORT_COLUMNS: { key: SortKey; label: string; short: string }[] = [
  { key: "k", label: "K", short: "K" },
  { key: "whiff", label: "Whiff/swing %", short: "Whiff/sw%" },
  { key: "mph", label: "FB mph", short: "FB mph" },
  { key: "spin", label: "FB spin", short: "Spin" },
  { key: "pitches", label: "Pitches", short: "Pitches" },
];

const SORT_VALUE: Record<SortKey, (r: DirectoryRow) => number | null> = {
  k: (r) => r.strikeouts,
  whiff: (r) => r.whiffPerSwing,
  mph: (r) => r.fbMph,
  spin: (r) => r.fbSpin,
  pitches: (r) => r.pitches,
};

export interface DirectoryFilters {
  q: string;
  team: number | null;
  hand: "R" | "L" | null;
  role: Role | null;
  minPitches: number;
}

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function filterAndSort(
  rows: DirectoryRow[],
  f: DirectoryFilters,
  sort: SortKey,
  dir: "asc" | "desc",
): DirectoryRow[] {
  const q = normalizeName(f.q.trim());
  const out = rows.filter(
    (r) =>
      r.pitches >= f.minPitches &&
      (f.team == null || r.teamId === f.team) &&
      (f.hand == null || r.hand === f.hand) &&
      (f.role == null || r.role === f.role) &&
      (q === "" || normalizeName(r.name).includes(q)),
  );
  const get = SORT_VALUE[sort];
  const sign = dir === "desc" ? -1 : 1;
  // Nulls always sort last, whichever direction.
  return out.sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return a.name.localeCompare(b.name);
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * sign || a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------
// Find by pitch
// ---------------------------------------------------------------------

export type PitchRankKey = "whiff" | "mph" | "spin" | "hbreak" | "usage";

export const PITCH_RANKS: { key: PitchRankKey; label: string }[] = [
  { key: "whiff", label: "Whiff/swing %" },
  { key: "mph", label: "Velocity" },
  { key: "spin", label: "Spin rate" },
  { key: "hbreak", label: "Horizontal break" },
  { key: "usage", label: "Usage" },
];

/** Pitch types offered in Find by pitch (aliases fold in via TYPE_GROUP). */
export const FIND_TYPES = ["FF", "SI", "FC", "SL", "ST", "CU", "CH", "FS"] as const;
const TYPE_GROUP: Record<string, string> = { FA: "FF", FT: "SI", SV: "ST", KC: "CU", CS: "CU", FO: "FS" };

export interface PitchFind {
  row: DirectoryRow;
  line: PitchTypeLine;
}

/** Minimum pitches of the type for a pitcher to be ranked. */
export const FIND_MIN_COUNT = 50;

export function findByPitch(
  rows: DirectoryRow[],
  type: string,
  minMph: number,
  rank: PitchRankKey,
): PitchFind[] {
  const out: PitchFind[] = [];
  for (const row of rows) {
    const line = row.mix.find((l) => (TYPE_GROUP[l.type] ?? l.type) === type);
    if (!line || line.count < FIND_MIN_COUNT) continue;
    if ((line.mph ?? 0) < minMph) continue;
    out.push({ row, line });
  }
  const val = (p: PitchFind): number => {
    const l = p.line;
    switch (rank) {
      case "whiff":
        return l.whiffPerSwing ?? -Infinity;
      case "mph":
        return l.mph ?? -Infinity;
      case "spin":
        return l.spin ?? -Infinity;
      case "hbreak":
        return Math.abs(l.hBreak ?? 0);
      case "usage":
        return l.usage;
    }
  };
  return out.sort((a, b) => val(b) - val(a));
}

// ---------------------------------------------------------------------
// Compact wire format: the directory ships ~470 rows to the client, and
// repeating the mix's eight field names per pitch type was over half
// the payload. Mix lines travel as tuples instead.
// ---------------------------------------------------------------------

export type MixTuple = [
  type: string,
  count: number,
  usage: number,
  mph: number | null,
  spin: number | null,
  hBreak: number | null,
  ivb: number | null,
  whiffPerSwing: number | null,
];

export type WireRow = Omit<DirectoryRow, "mix" | "href"> & { mix: MixTuple[] };

export function toWire(r: DirectoryRow): WireRow {
  const rest: Partial<DirectoryRow> = { ...r };
  delete rest.href; // rebuilt on the client from id + name
  delete rest.mix;
  return {
    ...(rest as Omit<DirectoryRow, "mix" | "href">),
    mix: r.mix.map((l) => [l.type, l.count, l.usage, l.mph, l.spin, l.hBreak, l.ivb, l.whiffPerSwing]),
  };
}

export function fromWire(r: WireRow, href: (id: number, name: string) => string): DirectoryRow {
  return {
    ...r,
    href: href(r.id, r.name),
    mix: r.mix.map(([type, count, usage, mph, spin, hBreak, ivb, whiffPerSwing]) => ({
      type,
      count,
      usage,
      mph,
      spin,
      hBreak,
      ivb,
      whiffPerSwing,
    })),
  };
}
