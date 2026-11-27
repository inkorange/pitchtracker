import { categorizeDescription, type OutcomeCategory } from "@/lib/viz/colors";

// Summaries for the redesigned Stats view (design/Stats.dc.html):
// season strip, by-pitch-type table, outcome mix, batter-side split.
// Whiff/CSW use the outcome categories (categorizeDescription), the
// same definitions as the rest of the Stats view.

export interface SummaryPitch {
  pitch_type: string | null;
  description: string | null;
  release_speed: number | null;
  release_spin_rate: number | null;
  events?: string | null;
  stand?: string | null;
  game_pk?: number | null;
  at_bat_number?: number | null;
  /** Absent = regular season. */
  game_type?: string | null;
}

const HITS = new Set(["single", "double", "triple", "home_run"]);
const WALKS = new Set(["walk", "intent_walk"]);
const KS = new Set(["strikeout", "strikeout_double_play"]);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export interface TypeRow {
  type: string;
  n: number;
  usage: number;
  mph: number | null;
  max: number | null;
  spin: number | null;
  strikePct: number | null;
  whiffs: number;
  cswPct: number | null;
}

export function byPitchType(ps: SummaryPitch[]): TypeRow[] {
  const groups = new Map<string, SummaryPitch[]>();
  for (const p of ps) {
    if (!p.pitch_type) continue;
    const a = groups.get(p.pitch_type) ?? [];
    a.push(p);
    groups.set(p.pitch_type, a);
  }
  const total = ps.filter((p) => p.pitch_type).length;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return [...groups.entries()]
    .map(([type, g]) => {
      const cats = g.map((p) => categorizeDescription(p.description));
      const speeds = g.map((p) => p.release_speed).filter((x): x is number => x != null);
      const spins = g.map((p) => p.release_spin_rate).filter((x): x is number => x != null);
      const whiffs = cats.filter((c) => c === "whiff").length;
      const called = cats.filter((c) => c === "called").length;
      const strikes = cats.filter((c) => c !== "ball" && c !== "other").length;
      const m = avg(speeds);
      const s = avg(spins);
      return {
        type,
        n: g.length,
        usage: total ? Math.round((g.length / total) * 1000) / 10 : 0,
        mph: m == null ? null : Math.round(m * 10) / 10,
        max: speeds.length ? Math.max(...speeds) : null,
        spin: s == null ? null : Math.round(s),
        strikePct: pct(strikes, g.length),
        whiffs,
        cswPct: pct(whiffs + called, g.length),
      };
    })
    .sort((a, b) => b.n - a.n);
}

export function outcomeMix(ps: SummaryPitch[]): { cat: OutcomeCategory; n: number; pct: number }[] {
  const order: OutcomeCategory[] = ["whiff", "called", "ball", "foul", "inplay"];
  const counts = new Map<OutcomeCategory, number>();
  for (const p of ps) {
    const c = categorizeDescription(p.description);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const total = ps.length;
  return order.map((cat) => ({ cat, n: counts.get(cat) ?? 0, pct: total ? ((counts.get(cat) ?? 0) / total) * 100 : 0 }));
}

export interface SideLine {
  side: "L" | "R";
  bf: number;
  k: number;
  bb: number;
  h: number;
  pitches: number;
  whiffPct: number | null;
}

/** Plate appearances end on the pitch whose `events` is set. */
export function sideSplit(ps: SummaryPitch[]): SideLine[] {
  return (["L", "R"] as const).map((side) => {
    const g = ps.filter((p) => p.stand === side);
    const ends = g.filter((p) => p.events);
    const whiffs = g.filter((p) => categorizeDescription(p.description) === "whiff").length;
    return {
      side,
      bf: ends.length,
      k: ends.filter((p) => KS.has(p.events as string)).length,
      bb: ends.filter((p) => WALKS.has(p.events as string)).length,
      h: ends.filter((p) => HITS.has(p.events as string)).length,
      pitches: g.length,
      whiffPct: pct(whiffs, g.length),
    };
  });
}

export interface SeasonStrip {
  pitches: number;
  bf: number;
  k: number;
  bb: number;
  h: number;
  hr: number;
  strikePct: number | null;
  whiffPct: number | null;
  cswPct: number | null;
}

export function seasonStrip(ps: SummaryPitch[]): SeasonStrip {
  const cats = ps.map((p) => categorizeDescription(p.description));
  const ends = ps.filter((p) => p.events);
  const whiffs = cats.filter((c) => c === "whiff").length;
  const called = cats.filter((c) => c === "called").length;
  return {
    pitches: ps.length,
    bf: ends.length,
    k: ends.filter((p) => KS.has(p.events as string)).length,
    bb: ends.filter((p) => WALKS.has(p.events as string)).length,
    h: ends.filter((p) => HITS.has(p.events as string)).length,
    hr: ends.filter((p) => p.events === "home_run").length,
    strikePct: pct(cats.filter((c) => c !== "ball" && c !== "other").length, ps.length),
    whiffPct: pct(whiffs, ps.length),
    cswPct: pct(whiffs + called, ps.length),
  };
}
