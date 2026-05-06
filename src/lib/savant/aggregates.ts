// Aggregate stats computed server-side from a SavantPitchRow[] result
// set, so the /explore tab strip doesn't repeat the math on every
// switch and so the cached /api/search response is self-contained.

import type { SavantPitchRow } from "./client";

export interface PitchTypeBreakdown {
  pitchType: string;
  pitchName: string | null;
  count: number;
  /** Share of the result set as a 0..1 fraction. */
  share: number;
  /** Mean release_speed in mph for this pitch type, or null when no row had a valid speed. */
  avgVelocity: number | null;
}

export interface SearchAggregates {
  totalPitches: number;
  /** mph */
  avgVelocity: number | null;
  /** mph */
  peakVelocity: number | null;
  /** inches (pfx_x * 12, sign preserved) */
  avgHorizontalBreak: number | null;
  /** inches (pfx_z * 12) */
  avgInducedVerticalBreak: number | null;
  /** rpm */
  avgSpinRate: number | null;
  /** Whiffs / swings as a 0..1 fraction. Null when no swings. */
  whiffRate: number | null;
  /** Strike-zone pitches / total as a 0..1 fraction. Null when total is 0. */
  inZoneRate: number | null;
  /** Pitch-type slice with count, share, avgVelo. Sorted by count desc. */
  pitchTypes: PitchTypeBreakdown[];
}

// Strike-zone definition. ±0.83 ft on x covers the 17" plate plus the
// ball's radius (a pitch that grazes the edge is a strike). The 1.5–3.5
// ft z range is the canonical broadcast zone — the actual sz_top /
// sz_bot vary per batter but aren't currently in our parsed columns.
const ZONE_X_MIN = -0.83;
const ZONE_X_MAX = 0.83;
const ZONE_Z_MIN = 1.5;
const ZONE_Z_MAX = 3.5;

const SWING_DESCRIPTIONS = new Set([
  "swinging_strike",
  "swinging_strike_blocked",
  "foul",
  "foul_tip",
  "foul_bunt",
  "missed_bunt",
  "hit_into_play",
]);

const WHIFF_DESCRIPTIONS = new Set([
  "swinging_strike",
  "swinging_strike_blocked",
  "missed_bunt",
]);

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

function maxOrNull(xs: number[]): number | null {
  if (xs.length === 0) return null;
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  return Number.isFinite(m) ? m : null;
}

export function computeAggregates(rows: SavantPitchRow[]): SearchAggregates {
  const total = rows.length;
  if (total === 0) {
    return {
      totalPitches: 0,
      avgVelocity: null,
      peakVelocity: null,
      avgHorizontalBreak: null,
      avgInducedVerticalBreak: null,
      avgSpinRate: null,
      whiffRate: null,
      inZoneRate: null,
      pitchTypes: [],
    };
  }

  const velocities: number[] = [];
  const hBreaks: number[] = [];
  const vBreaks: number[] = [];
  const spins: number[] = [];

  let swings = 0;
  let whiffs = 0;
  let zoneCount = 0;
  let zoneSampled = 0;

  // Collect per-pitch-type buckets in a single pass.
  const byType = new Map<string, { count: number; vel: number[]; name: string | null }>();

  for (const r of rows) {
    if (typeof r.release_speed === "number") velocities.push(r.release_speed);
    if (typeof r.pfx_x === "number") hBreaks.push(r.pfx_x * 12);
    if (typeof r.pfx_z === "number") vBreaks.push(r.pfx_z * 12);
    if (typeof r.release_spin_rate === "number") spins.push(r.release_spin_rate);

    if (r.description) {
      if (SWING_DESCRIPTIONS.has(r.description)) swings++;
      if (WHIFF_DESCRIPTIONS.has(r.description)) whiffs++;
    }

    if (typeof r.plate_x === "number" && typeof r.plate_z === "number") {
      zoneSampled++;
      if (
        r.plate_x >= ZONE_X_MIN &&
        r.plate_x <= ZONE_X_MAX &&
        r.plate_z >= ZONE_Z_MIN &&
        r.plate_z <= ZONE_Z_MAX
      ) {
        zoneCount++;
      }
    }

    const pt = r.pitch_type ?? "UN";
    const bucket = byType.get(pt) ?? { count: 0, vel: [], name: r.pitch_name ?? null };
    bucket.count++;
    if (typeof r.release_speed === "number") bucket.vel.push(r.release_speed);
    if (!bucket.name && r.pitch_name) bucket.name = r.pitch_name;
    byType.set(pt, bucket);
  }

  const pitchTypes: PitchTypeBreakdown[] = Array.from(byType.entries())
    .map(([pitchType, b]) => ({
      pitchType,
      pitchName: b.name,
      count: b.count,
      share: b.count / total,
      avgVelocity: mean(b.vel),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalPitches: total,
    avgVelocity: mean(velocities),
    peakVelocity: maxOrNull(velocities),
    avgHorizontalBreak: mean(hBreaks),
    avgInducedVerticalBreak: mean(vBreaks),
    avgSpinRate: mean(spins),
    whiffRate: swings > 0 ? whiffs / swings : null,
    inZoneRate: zoneSampled > 0 ? zoneCount / zoneSampled : null,
    pitchTypes,
  };
}
