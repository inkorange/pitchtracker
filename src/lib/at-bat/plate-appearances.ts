// Group a pitcher's season pitches into plate appearances, and
// summarize a matchup. Pure — the loader (matchups.ts) feeds it cached
// Savant rows.

export interface PitchInput {
  game_pk: number;
  at_bat_number: number;
  pitch_number: number;
  pitch_type: string | null;
  batter_id: number | null;
  description: string | null;
  events: string | null;
  inning: number | null;
  inning_topbot: string | null;
  game_date: string | null;
}

export interface PlateAppearance {
  gamePk: number;
  atBat: number;
  date: string | null;
  inning: number | null;
  /** "Top" | "Bot" — the half the batter hit in. */
  half: "Top" | "Bot" | null;
  batterId: number;
  /** Pitch types in order. */
  sequence: string[];
  /** Final count when the PA ended, e.g. "3-2". */
  count: string;
  /** Raw Statcast `events` of the terminating pitch, or null if unknown. */
  event: string | null;
  swingingStrikes: number;
}

const BALLS = new Set(["ball", "blocked_ball", "intent_ball", "pitchout"]);
const STRIKES = new Set([
  "called_strike",
  "swinging_strike",
  "swinging_strike_blocked",
  "missed_bunt",
  "foul_tip",
]);
const FOULS = new Set(["foul", "foul_bunt"]);
const SWINGING = new Set(["swinging_strike", "swinging_strike_blocked", "foul_tip", "missed_bunt"]);

/** Final count after a sequence of Statcast pitch descriptions. */
export function finalCount(descriptions: (string | null)[]): string {
  let b = 0;
  let s = 0;
  for (const d of descriptions) {
    if (!d) continue;
    if (BALLS.has(d)) b = Math.min(b + 1, 4);
    else if (STRIKES.has(d)) s = Math.min(s + 1, 3);
    else if (FOULS.has(d) && s < 2) s += 1;
  }
  return `${Math.min(b, 3)}-${Math.min(s, 2)}`;
}

export function groupPlateAppearances(pitches: PitchInput[]): PlateAppearance[] {
  const byPa = new Map<string, PitchInput[]>();
  for (const p of pitches) {
    if (p.batter_id == null) continue;
    const key = `${p.game_pk}:${p.at_bat_number}`;
    const arr = byPa.get(key) ?? [];
    arr.push(p);
    byPa.set(key, arr);
  }
  const out: PlateAppearance[] = [];
  for (const rows of byPa.values()) {
    rows.sort((a, b) => a.pitch_number - b.pitch_number);
    const first = rows[0];
    const last = rows[rows.length - 1];
    out.push({
      gamePk: first.game_pk,
      atBat: first.at_bat_number,
      date: first.game_date,
      inning: first.inning,
      half: first.inning_topbot === "Top" ? "Top" : first.inning_topbot === "Bot" ? "Bot" : null,
      batterId: first.batter_id as number,
      sequence: rows.map((r) => r.pitch_type ?? "UN"),
      count: finalCount(rows.map((r) => r.description)),
      event: rows.find((r) => r.events)?.events ?? last.events ?? null,
      swingingStrikes: rows.filter((r) => r.description && SWINGING.has(r.description)).length,
    });
  }
  // Most recent first.
  return out.sort(
    (a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.gamePk - a.gamePk || b.atBat - a.atBat,
  );
}

const HITS = new Set(["single", "double", "triple", "home_run"]);
const WALKS = new Set(["walk", "intent_walk"]);
const STRIKEOUTS = new Set(["strikeout", "strikeout_double_play"]);
/** PA outcomes that don't count as an official at-bat. */
const NOT_AB = new Set([
  "walk",
  "intent_walk",
  "hit_by_pitch",
  "sac_fly",
  "sac_bunt",
  "sac_fly_double_play",
  "sac_bunt_double_play",
  "catcher_interf",
]);

export interface MatchupSummary {
  pa: number;
  ab: number;
  h: number;
  k: number;
  bb: number;
  pitches: number;
  /** Swinging strikes per pitch × 100 — the homepage's Whiff% definition. */
  whiffPct: number | null;
}

export function summarize(pas: PlateAppearance[]): MatchupSummary {
  // Only completed PAs (with a terminating event) count toward PA/AB.
  const done = pas.filter((p) => p.event);
  const pitches = pas.reduce((s, p) => s + p.sequence.length, 0);
  const sw = pas.reduce((s, p) => s + p.swingingStrikes, 0);
  return {
    pa: done.length,
    ab: done.filter((p) => !NOT_AB.has(p.event as string)).length,
    h: done.filter((p) => HITS.has(p.event as string)).length,
    k: done.filter((p) => STRIKEOUTS.has(p.event as string)).length,
    bb: done.filter((p) => WALKS.has(p.event as string)).length,
    pitches,
    whiffPct: pitches > 0 ? Math.round((sw / pitches) * 1000) / 10 : null,
  };
}

const EVENT_LABEL: Record<string, string> = {
  strikeout: "Strikeout",
  strikeout_double_play: "Strikeout (DP)",
  walk: "Walk",
  intent_walk: "Intentional walk",
  hit_by_pitch: "Hit by pitch",
  single: "Single",
  double: "Double",
  triple: "Triple",
  home_run: "Home run",
  field_out: "Out",
  force_out: "Force out",
  grounded_into_double_play: "GIDP",
  double_play: "Double play",
  triple_play: "Triple play",
  fielders_choice: "Fielder's choice",
  fielders_choice_out: "Fielder's choice",
  sac_fly: "Sac fly",
  sac_bunt: "Sac bunt",
  field_error: "Error",
  catcher_interf: "Catcher interference",
};

export function eventLabel(event: string | null): string {
  if (!event) return "—";
  return EVENT_LABEL[event] ?? event.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** "good for the pitcher" | "good for the batter" | neutral — for color. */
export function eventTone(event: string | null): "pitcher" | "batter" | "neutral" {
  if (!event) return "neutral";
  if (HITS.has(event) || WALKS.has(event) || event === "hit_by_pitch") return "batter";
  if (NOT_AB.has(event) || event === "field_error" || event === "catcher_interf") return "neutral";
  return "pitcher";
}
