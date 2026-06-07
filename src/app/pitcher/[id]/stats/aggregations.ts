// Pure-function aggregations over the cached arsenal pitch list.
// Every Stats card pulls from these so the math is in one place and
// stays consistent across views.
//
// Input shape mirrors the rows returned by /api/pitcher/[id]/arsenal
// (a subset of pitch_game_pitches, plus the resolved label).

import { categorizeDescription } from "@/lib/viz/colors";

export interface StatPitch {
  pitch_type: string | null;
  description: string | null;
  release_speed: number | null;
  release_pos_x: number | null;
  release_pos_z: number | null;
  plate_x: number | null;
  plate_z: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
  spin_axis: number | null;
  release_spin_rate: number | null;
  vy0: number | null;
  vz0: number | null;
  az: number | null;
  // Statcast run expectancy delta from the offense's point of view.
  // Negative = pitch reduced offensive run expectancy = good for the
  // pitcher. Callers sum `-delta_run_exp` so positive numbers mean
  // "saved runs".
  delta_run_exp: number | null;
}

/**
 * Vertical Approach Angle at the plate, in degrees. Negative = ball
 * descends into the zone; closer to 0 = "flat" (read: high-fastball
 * effective). Computed from initial vertical velocity, vertical
 * acceleration, and the y-distance from release to plate.
 *
 * Standard kinematics:  vz_plate = vz0 + az * t,  where t is the time
 * the ball takes to travel from release (y ≈ 50 ft from home plate)
 * to plate (y = 17/12 ft past front of plate). We approximate t from
 * vy0 alone (true t comes from a quadratic in y; the linearization is
 * close enough for ranking purposes and matches the simplified
 * formulas Driveline uses).
 */
export function approachAngleDeg(p: StatPitch): number | null {
  if (p.vy0 == null || p.vz0 == null || p.az == null) return null;
  // Approx flight time from release to plate at y=1.417 ft.
  // y(t) = y0 + vy0 * t + 0.5 * ay * t^2; with ay ~0 this is t = (y - y0) / vy0.
  // Statcast ships vy0 negative (ball moving toward catcher).
  const y0 = 50; // release y in MLB Statcast convention
  const yPlate = 17 / 12;
  const t = (yPlate - y0) / p.vy0;
  const vzPlate = p.vz0 + p.az * t;
  // arctan(vz / |vy|), sign preserved.
  const angleRad = Math.atan2(vzPlate, Math.abs(p.vy0));
  return (angleRad * 180) / Math.PI;
}

export interface PerPitchStats {
  pitch_type: string;
  pitches: number;
  usage_pct: number;
  velo_mean: number | null;
  velo_std: number | null;
  csw_pct: number; // (called + swinging strikes) / pitches
  whiff_pct: number; // swinging strikes / pitches
  vaa_mean: number | null;
  // Run-value math (RunValueCard). Pitcher frame: rv_sum is sum of
  // -delta_run_exp across pitches in the bucket, so positive = saves
  // runs. rv_n is the count of pitches whose delta_run_exp was
  // non-null (denominator for /100). rv_per_100 is suppressed (null)
  // when rv_n < 10 — too noisy to display.
  rv_sum: number | null;
  rv_per_100: number | null;
  rv_n: number;
}

export interface TotalStats {
  pitches: number;
  csw_pct: number;
  whiff_pct: number;
}

export interface AggregatedStats {
  total: TotalStats;
  perPitch: PerPitchStats[];
}

/** Minimum pitch count with a known delta_run_exp before the /100 rate
 *  is reliable enough to display. Below this the bucket's rv_per_100
 *  is suppressed (set to null); rv_sum is still shown. */
export const RV_PER_100_MIN_N = 10;

export function aggregate(rows: StatPitch[]): AggregatedStats {
  const buckets = new Map<
    string,
    {
      pitches: number;
      veloSum: number;
      veloSumSq: number;
      veloN: number;
      called: number;
      whiff: number;
      vaaSum: number;
      vaaN: number;
      rvSum: number;
      rvN: number;
    }
  >();
  let totalCalled = 0;
  let totalWhiff = 0;
  for (const p of rows) {
    if (!p.pitch_type) continue;
    let b = buckets.get(p.pitch_type);
    if (!b) {
      b = {
        pitches: 0,
        veloSum: 0,
        veloSumSq: 0,
        veloN: 0,
        called: 0,
        whiff: 0,
        vaaSum: 0,
        vaaN: 0,
        rvSum: 0,
        rvN: 0,
      };
      buckets.set(p.pitch_type, b);
    }
    b.pitches += 1;
    if (p.release_speed != null) {
      b.veloSum += p.release_speed;
      b.veloSumSq += p.release_speed * p.release_speed;
      b.veloN += 1;
    }
    const cat = categorizeDescription(p.description);
    if (cat === "whiff") {
      b.whiff += 1;
      totalWhiff += 1;
    } else if (cat === "called") {
      b.called += 1;
      totalCalled += 1;
    }
    const vaa = approachAngleDeg(p);
    if (vaa != null && Number.isFinite(vaa)) {
      b.vaaSum += vaa;
      b.vaaN += 1;
    }
    // Run value, pitcher frame: -delta_run_exp. Skip nulls in BOTH
    // numerator (sum) and denominator (count) so the /100 rate
    // reflects only pitches whose RV is actually known.
    if (p.delta_run_exp != null && Number.isFinite(p.delta_run_exp)) {
      b.rvSum += -p.delta_run_exp;
      b.rvN += 1;
    }
  }

  const totalPitches = Array.from(buckets.values()).reduce(
    (acc, b) => acc + b.pitches,
    0,
  );

  const perPitch: PerPitchStats[] = Array.from(buckets.entries())
    .map(([pitch_type, b]) => {
      const veloMean = b.veloN > 0 ? b.veloSum / b.veloN : null;
      const veloVar =
        b.veloN > 0
          ? Math.max(0, b.veloSumSq / b.veloN - (veloMean ?? 0) ** 2)
          : null;
      const veloStd = veloVar != null ? Math.sqrt(veloVar) : null;
      const rvSum = b.rvN > 0 ? b.rvSum : null;
      const rvPer100 =
        b.rvN >= RV_PER_100_MIN_N ? (b.rvSum / b.rvN) * 100 : null;
      return {
        pitch_type,
        pitches: b.pitches,
        usage_pct: totalPitches > 0 ? (b.pitches / totalPitches) * 100 : 0,
        velo_mean: veloMean,
        velo_std: veloStd,
        csw_pct: b.pitches > 0 ? ((b.called + b.whiff) / b.pitches) * 100 : 0,
        whiff_pct: b.pitches > 0 ? (b.whiff / b.pitches) * 100 : 0,
        vaa_mean: b.vaaN > 0 ? b.vaaSum / b.vaaN : null,
        rv_sum: rvSum,
        rv_per_100: rvPer100,
        rv_n: b.rvN,
      };
    })
    .sort((a, b) => b.pitches - a.pitches);

  return {
    total: {
      pitches: totalPitches,
      csw_pct:
        totalPitches > 0
          ? ((totalCalled + totalWhiff) / totalPitches) * 100
          : 0,
      whiff_pct: totalPitches > 0 ? (totalWhiff / totalPitches) * 100 : 0,
    },
    perPitch,
  };
}
