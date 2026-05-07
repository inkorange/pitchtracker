// Pitch-type semantic colors, tuned for emissive materials on a dark stage.

export const PITCH_COLORS: Record<string, string> = {
  FF: "#ff4655",
  FA: "#ff4655",
  SI: "#ff7a3a",
  FT: "#ff7a3a",
  FC: "#ffaa44",
  SL: "#9b6bff",
  ST: "#5588ff",
  SV: "#5588ff",
  CU: "#3855ff",
  KC: "#5544aa",
  CS: "#3855ff",
  CH: "#33d4aa",
  FS: "#44cc66",
  FO: "#44cc66",
  KN: "#ffd633",
  EP: "#aaaaaa",
  PO: "#aaaaaa",
  IN: "#aaaaaa",
  UN: "#888888",
};

export const PITCH_LABELS: Record<string, string> = {
  FF: "Four-Seam",
  FA: "Four-Seam",
  SI: "Sinker",
  FT: "Two-Seam",
  FC: "Cutter",
  SL: "Slider",
  ST: "Sweeper",
  SV: "Sweeper",
  CU: "Curveball",
  KC: "Knuckle Curve",
  CS: "Slow Curve",
  CH: "Changeup",
  FS: "Splitter",
  FO: "Forkball",
  KN: "Knuckleball",
  EP: "Eephus",
};

export function getPitchColor(pitchType: string): string {
  return PITCH_COLORS[pitchType.toUpperCase()] ?? "#888888";
}

export function getPitchLabel(pitchType: string): string {
  return PITCH_LABELS[pitchType.toUpperCase()] ?? pitchType;
}

// =====================================================================
// Two-pitcher comparison palette: pitcher A uses the semantic colors
// above; pitcher B uses the same colors with a 70° hue rotation, so the
// two arsenals read as warm-vs-cool while keeping within-pitcher
// pitch-type semantic distinction (a "fastball" is still the brightest
// reddish/orange end of B's palette, etc.).
// =====================================================================

const COMPARE_HUE_SHIFT_B = 70;

export type CompareSide = "a" | "b";

export function getPitchColorForSide(pitchType: string, side: CompareSide): string {
  const base = getPitchColor(pitchType);
  if (side === "a") return base;
  return rotateHue(base, COMPARE_HUE_SHIFT_B);
}

function rotateHue(hex: string, degrees: number): string {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const h2 = (((h * 360 + degrees) % 360) + 360) % 360 / 360;
  const { r: r2, g: g2, b: b2 } = hslToRgb(h2, s, l);
  return rgbToHex(r2, g2, b2);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

// =====================================================================
// Outcome colors: per-pitch result palette used for plate-dot markers
// and outcome filter chips. Categories collapse Statcast's many
// `description` values into the five categories pitchers + hitters
// actually talk about.
// =====================================================================

export type OutcomeCategory = "whiff" | "called" | "ball" | "foul" | "inplay" | "other";

export const OUTCOME_COLORS: Record<OutcomeCategory, string> = {
  whiff: "#ef4444", // bright red — swing and miss
  called: "#f59e0b", // amber — caught looking
  ball: "#3b82f6", // blue — outside the zone
  foul: "#a3a3a3", // neutral gray
  inplay: "#22c55e", // green — bat met ball
  other: "#7a8694", // unknown
};

export const OUTCOME_LABELS: Record<OutcomeCategory, string> = {
  whiff: "Swinging strike",
  called: "Called strike",
  ball: "Ball",
  foul: "Foul",
  inplay: "In play",
  other: "Other",
};

export function categorizeDescription(description: string | null | undefined): OutcomeCategory {
  if (!description) return "other";
  switch (description) {
    case "swinging_strike":
    case "swinging_strike_blocked":
    case "missed_bunt":
    case "foul_tip":
      return "whiff";
    case "called_strike":
      return "called";
    case "ball":
    case "blocked_ball":
    case "intent_ball":
    case "pitchout":
    case "hit_by_pitch":
      return "ball";
    case "foul":
    case "foul_bunt":
      return "foul";
    case "hit_into_play":
    case "hit_into_play_no_out":
      return "inplay";
    default:
      return "other";
  }
}

export function getOutcomeColor(description: string | null | undefined): string {
  return OUTCOME_COLORS[categorizeDescription(description)];
}

// Tailwind classes for the at-bat result pill — green for hits and
// productive outcomes, red for outs, neutral for everything else.
// Static class strings so they stay statically analyzable.
export function eventPillColor(event: string | null | undefined): string {
  if (!event) return "bg-white/[0.18] border-white/30";
  const e = event.toLowerCase();
  const greens = new Set([
    "single",
    "double",
    "triple",
    "home_run",
    "sac_fly",
    "sac_bunt",
  ]);
  const reds = new Set([
    "strikeout",
    "strikeout_double_play",
    "field_out",
    "force_out",
    "grounded_into_double_play",
    "double_play",
    "triple_play",
    "fielders_choice",
    "fielders_choice_out",
    "sac_fly_double_play",
    "other_out",
  ]);
  if (greens.has(e)) return "bg-emerald-500/35 border-emerald-400/60";
  if (reds.has(e)) return "bg-red-500/35 border-red-400/60";
  return "bg-white/[0.18] border-white/30";
}

function hslToRgb(h: number, s: number, l: number) {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: hue2rgb(h + 1 / 3),
    g: hue2rgb(h),
    b: hue2rgb(h - 1 / 3),
  };
}
