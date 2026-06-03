// Arsenal radar: percentile-normalized "stuff" profile per pitch type
// for the Pitcher Stats view. Each pitch the pitcher throws gets a
// radar (spider) chart with five axes — Velocity, Spin, iVB, HB,
// Whiff% — where the axis value is the league percentile for that
// (pitch_type, metric) pairing across all pitchers in the active
// season.
//
// Why percentile and not raw value: a 95 mph fastball reads
// completely differently from a 95 mph changeup; the percentile axis
// normalizes the units automatically so all five metrics share the
// same 0-1 scale. And a "league-best" 4-seam (98+ mph) and a
// "league-best" curveball (3000+ rpm) both pin their own respective
// axes — comparable shapes across pitch types.
//
// Direction: every metric is oriented so HIGHER percentile is BETTER
// for the pitcher. Break metrics use absolute values so "more break"
// is the axis (direction is implicit in the pitch type label).

export const RADAR_AXES = [
  "velo",
  "spin",
  "ivb",
  "hb",
  "whiff",
] as const;

export type RadarAxis = (typeof RADAR_AXES)[number];

export const RADAR_AXIS_LABELS: Record<RadarAxis, string> = {
  velo: "Velocity",
  spin: "Spin",
  ivb: "iVB",
  hb: "HB",
  whiff: "Whiff %",
};

export const RADAR_AXIS_HINTS: Record<RadarAxis, string> = {
  velo: "Average release speed (mph)",
  spin: "Average spin rate (rpm)",
  ivb: "Total induced vertical break (in) — absolute value, more = more movement",
  hb: "Total horizontal break (in) — absolute value, more = more movement",
  whiff: "Swing-and-miss rate among swings",
};

export interface RadarPitch {
  /** Pitch type code, e.g. "FF", "SL". */
  pitch_type: string;
  /** Raw values — velocity mph, spin rpm, break inches, whiff%. */
  raw: Record<RadarAxis, number | null>;
  /** League percentile per axis, 0-1. NaN when no league data. */
  percentile: Record<RadarAxis, number>;
  /** Total pitches the pitcher threw of this type — drives the
   *  small "(n=…)" label under each radar so a tiny sample reads
   *  with appropriate skepticism. */
  pitchCount: number;
}

export interface ArsenalRadar {
  pitches: RadarPitch[];
  /** Minimum league sample size used to filter out tiny-sample
   *  aggregates from the percentile computation. */
  minPitchesForLeague: number;
}

/** Minimum pitches a pitcher must have thrown of a given pitch type
 *  to be included in the league percentile pool. Keeps a 4-pitch
 *  curveball blip from setting a league record on every axis. */
export const MIN_LEAGUE_PITCHES = 25;
