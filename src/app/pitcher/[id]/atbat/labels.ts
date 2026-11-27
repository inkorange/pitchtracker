// Pure display helpers for at-bat mode (design/AtBat.dc.html,
// AtBatMobile.dc.html): per-pitch result labels, count after each
// pitch, short names for the mobile cards, and the catcher-view zone
// mapping for the inset.

import { eventLabel } from "@/lib/at-bat/plate-appearances";
import { getPitchLabel } from "@/lib/viz/colors";

export interface SeqPitch {
  pitch_type: string | null;
  description: string | null;
  events: string | null;
  balls: number | null;
  strikes: number | null;
  plate_x: number | null;
  plate_z: number | null;
}

const RESULT: Record<string, string> = {
  called_strike: "Called strike",
  ball: "Ball",
  blocked_ball: "Ball",
  intent_ball: "Intentional ball",
  pitchout: "Pitchout",
  foul: "Foul",
  foul_tip: "Foul tip",
  foul_bunt: "Foul bunt",
  bunt_foul_tip: "Foul bunt",
  swinging_strike: "Swinging strike",
  swinging_strike_blocked: "Swinging strike",
  missed_bunt: "Missed bunt",
  hit_into_play: "In play",
  hit_by_pitch: "Hit by pitch",
};

const RESULT_SHORT: Record<string, string> = {
  called_strike: "Called",
  ball: "Ball",
  blocked_ball: "Ball",
  intent_ball: "Ball",
  pitchout: "Ball",
  foul: "Foul",
  foul_tip: "Foul tip",
  foul_bunt: "Foul",
  bunt_foul_tip: "Foul",
  swinging_strike: "Whiff",
  swinging_strike_blocked: "Whiff",
  missed_bunt: "Whiff",
  hit_into_play: "In play",
  hit_by_pitch: "HBP",
};

const title = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** "Called strike", "Swinging strike", "In play"… */
export function pitchResult(description: string | null): string {
  if (!description) return "—";
  return RESULT[description] ?? title(description);
}

/** Mobile card form: "Called", "Whiff", "Ball", "Foul". */
export function pitchResultShort(description: string | null): string {
  if (!description) return "—";
  return RESULT_SHORT[description] ?? title(description);
}

const SHORT_TYPE: Record<string, string> = {
  FF: "4-Seam",
  SI: "Sinker",
  FC: "Cutter",
  SL: "Slider",
  ST: "Sweeper",
  SV: "Slurve",
  CU: "Curve",
  KC: "K-Curve",
  CS: "Curve",
  CH: "Change",
  FS: "Splitter",
  FO: "Forkball",
  KN: "Knuckler",
  EP: "Eephus",
};

export function shortPitchName(type: string | null): string {
  if (!type) return "—";
  return SHORT_TYPE[type] ?? getPitchLabel(type);
}

const EVENT_ABBR: Record<string, string> = {
  strikeout: "K",
  strikeout_double_play: "K",
  walk: "BB",
  intent_walk: "IBB",
  hit_by_pitch: "HBP",
  single: "1B",
  double: "2B",
  triple: "3B",
  home_run: "HR",
};

/** Count after each pitch; the last pitch shows how the PA ended ("K", "1B", "Out"). */
export function countsAfter(ps: SeqPitch[]): string[] {
  return ps.map((p, i) => {
    const next = ps[i + 1];
    if (next) return `${next.balls ?? 0}-${next.strikes ?? 0}`;
    if (p.events) return EVENT_ABBR[p.events] ?? "Out";
    // Unfinished PA in the data: advance the count by this pitch.
    const b = p.balls ?? 0;
    const s = p.strikes ?? 0;
    const d = p.description ?? "";
    if (d.includes("ball")) return `${Math.min(b + 1, 3)}-${s}`;
    if (d === "foul" || d === "foul_tip") return `${b}-${Math.min(s + 1, 2)}`;
    if (d.includes("strike")) return `${b}-${Math.min(s + 1, 2)}`;
    return `${b}-${s}`;
  });
}

export function countBefore(p: SeqPitch | undefined): string {
  return p ? `${p.balls ?? 0}-${p.strikes ?? 0}` : "0-0";
}

/** "Strikeout swinging", "Strikeout looking", "Single"… */
export function atBatResult(ps: SeqPitch[]): string | null {
  const last = ps[ps.length - 1];
  if (!last?.events) return null;
  if (last.events === "strikeout" || last.events === "strikeout_double_play") {
    return last.description === "called_strike" ? "Strikeout looking" : "Strikeout swinging";
  }
  return eventLabel(last.events);
}

// Zone inset geometry (viewBox 172×200; zone rect x 36–136, y 30–160).
// Catcher's view: Statcast plate_x is already from the catcher's
// perspective, so +x draws right. Zone edges: half the plate (8.5in)
// plus a ball radius ≈ 0.83 ft; height uses the typical 1.5–3.5 ft.
export const ZONE = { left: 36, right: 136, top: 30, bottom: 160 } as const;
const HALF_W_FT = 0.83;
const SZ_BOT = 1.5;
const SZ_TOP = 3.5;

export function zonePoint(plateX: number | null, plateZ: number | null): { x: number; y: number } | null {
  if (plateX == null || plateZ == null) return null;
  const cx = (ZONE.left + ZONE.right) / 2;
  const x = cx + (plateX / HALF_W_FT) * ((ZONE.right - ZONE.left) / 2);
  const y = ZONE.bottom - ((plateZ - SZ_BOT) / (SZ_TOP - SZ_BOT)) * (ZONE.bottom - ZONE.top);
  // Keep wild pitches inside the inset.
  return { x: Math.min(Math.max(x, 12), 160), y: Math.min(Math.max(y, 12), 184) };
}
