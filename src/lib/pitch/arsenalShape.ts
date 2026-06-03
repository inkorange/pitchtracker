// Per-pitch-type "shape" aggregates — release point, vertical
// approach angle, and plate location — packaged so the AI assistant
// can answer "what does the release cloud / VAA chart / heat map
// show here?" with a short read of the active pitcher's actual
// numbers instead of a generic chart-type description.
//
// All three of the corresponding stat cards aggregate their own
// data client-side from the raw arsenal pitches. We deliberately
// re-derive everything from the same raw rows here (rather than
// extending pitch_pitcher_aggregates) so the tool's output stays
// in lockstep with what the user is actually seeing on screen,
// without a separate cache layer to keep in sync.

import { getPitchLabel } from "@/lib/viz/colors";

// Vertical Approach Angle at the plate (degrees). Lifted out of
// stats/aggregations so this lib doesn't depend on a UI module —
// the math is short and stable enough to keep colocated. Matches
// the formula the stats card uses so the tool's vaa_avg lines up
// with the VAA bars the user sees.
function approachAngleDeg(p: {
  vy0: number | null;
  vz0: number | null;
  az: number | null;
}): number | null {
  if (p.vy0 == null || p.vz0 == null || p.az == null) return null;
  const y0 = 50; // Statcast release y, ft
  const yPlate = 17 / 12;
  const t = (yPlate - y0) / p.vy0;
  const vzPlate = p.vz0 + p.az * t;
  return (Math.atan2(vzPlate, Math.abs(p.vy0)) * 180) / Math.PI;
}

// Rule-book strike zone for an average batter, in plate coordinates
// (feet). plate_x = 0 is the center of the plate; positive plate_x
// is the third-base side from the catcher's POV (glove side for a
// RHP, arm side for a LHP). plate_z is height above the ground.
const ZONE_X_MIN = -0.708;
const ZONE_X_MAX = 0.708;
const ZONE_Z_MIN = 1.5;
const ZONE_Z_MAX = 3.5;

export interface ShapePitch {
  pitch_type: string | null;
  release_pos_x: number | null;
  release_pos_z: number | null;
  plate_x: number | null;
  plate_z: number | null;
  vy0: number | null;
  vz0: number | null;
  az: number | null;
}

export interface ShapePerPitchType {
  pitch_type: string;
  label: string;
  count: number;
  /** Where the ball comes out of the hand. x positive = third-base
   *  side from the catcher's POV (arm side for a RHP). z = height
   *  above the ground. Both in feet. */
  release_x_avg: number | null;
  release_z_avg: number | null;
  /** Standard deviation of the release coordinates. Tight values
   *  across pitch types = tunneled release; wide values = a tell. */
  release_x_spread: number | null;
  release_z_spread: number | null;
  /** Vertical Approach Angle at the plate (degrees). Closer to 0 =
   *  flatter (top-fastball territory); more negative = steeper
   *  descent (curveballs, depthy sinkers). */
  vaa_avg: number | null;
  /** Plate location centroid in feet. plate_x positive = third-base
   *  side from the catcher's POV. plate_z = height above the ground. */
  plate_x_avg: number | null;
  plate_z_avg: number | null;
  /** Share of pitches that crossed the rule-book strike zone (0–100). */
  in_zone_pct: number;
}

export interface ArsenalShape {
  /** "L" / "R" / null — knowing throwing hand lets a reader translate
   *  a positive plate_x ("third base side") into arm-side vs glove-
   *  side without having to remember the convention. */
  pitcher_throws: "L" | "R" | null;
  pitch_types: ShapePerPitchType[];
}

export function buildArsenalShape(
  pitches: ShapePitch[],
  pitcherThrows: "L" | "R" | null,
): ArsenalShape {
  interface Bucket {
    count: number;
    rxSum: number;
    rxSumSq: number;
    rxN: number;
    rzSum: number;
    rzSumSq: number;
    rzN: number;
    vaaSum: number;
    vaaN: number;
    pxSum: number;
    pxN: number;
    pzSum: number;
    pzN: number;
    inZone: number;
    locN: number;
  }
  const buckets = new Map<string, Bucket>();
  const blank = (): Bucket => ({
    count: 0,
    rxSum: 0,
    rxSumSq: 0,
    rxN: 0,
    rzSum: 0,
    rzSumSq: 0,
    rzN: 0,
    vaaSum: 0,
    vaaN: 0,
    pxSum: 0,
    pxN: 0,
    pzSum: 0,
    pzN: 0,
    inZone: 0,
    locN: 0,
  });

  for (const p of pitches) {
    if (!p.pitch_type) continue;
    let b = buckets.get(p.pitch_type);
    if (!b) {
      b = blank();
      buckets.set(p.pitch_type, b);
    }
    b.count += 1;

    if (p.release_pos_x != null) {
      b.rxSum += p.release_pos_x;
      b.rxSumSq += p.release_pos_x * p.release_pos_x;
      b.rxN += 1;
    }
    if (p.release_pos_z != null) {
      b.rzSum += p.release_pos_z;
      b.rzSumSq += p.release_pos_z * p.release_pos_z;
      b.rzN += 1;
    }

    const vaa = approachAngleDeg(p);
    if (vaa != null && Number.isFinite(vaa)) {
      b.vaaSum += vaa;
      b.vaaN += 1;
    }

    if (p.plate_x != null && p.plate_z != null) {
      b.pxSum += p.plate_x;
      b.pxN += 1;
      b.pzSum += p.plate_z;
      b.pzN += 1;
      b.locN += 1;
      if (
        p.plate_x >= ZONE_X_MIN &&
        p.plate_x <= ZONE_X_MAX &&
        p.plate_z >= ZONE_Z_MIN &&
        p.plate_z <= ZONE_Z_MAX
      ) {
        b.inZone += 1;
      }
    }
  }

  const pitch_types: ShapePerPitchType[] = Array.from(buckets.entries())
    .map(([pitch_type, b]) => ({
      pitch_type,
      label: getPitchLabel(pitch_type),
      count: b.count,
      release_x_avg: b.rxN > 0 ? b.rxSum / b.rxN : null,
      release_z_avg: b.rzN > 0 ? b.rzSum / b.rzN : null,
      release_x_spread:
        b.rxN > 1 ? stddev(b.rxSum, b.rxSumSq, b.rxN) : null,
      release_z_spread:
        b.rzN > 1 ? stddev(b.rzSum, b.rzSumSq, b.rzN) : null,
      vaa_avg: b.vaaN > 0 ? b.vaaSum / b.vaaN : null,
      plate_x_avg: b.pxN > 0 ? b.pxSum / b.pxN : null,
      plate_z_avg: b.pzN > 0 ? b.pzSum / b.pzN : null,
      in_zone_pct: b.locN > 0 ? (b.inZone / b.locN) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { pitcher_throws: pitcherThrows, pitch_types };
}

function stddev(sum: number, sumSq: number, n: number): number {
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  return Math.sqrt(variance);
}
