// Multi-type tunnel envelope: builds the visual cone that wraps a
// pitcher's pitches from release until the bundle's between-type
// spread grows by more than one baseball BEYOND its natural release-
// point baseline. This "spread-delta" framing decouples in-flight
// divergence (the actual deception) from natural slot variance, which
// is reported separately as a stat. Matches the spirit of published
// tunneling metrics (BP's Plate:Tunnel Ratio implicitly does the same
// baseline cancellation through ratio rather than subtraction).
//
// Where this differs from tunneling.ts: that file handles the pairwise
// case (compare view, "pitch A vs pitch B"). This file handles the
// aggregate case used on the pitcher arsenal page — N pitches grouped
// into M pitch types, deciding when the bundle "breaks apart".
//
// Coordinate convention is Statcast throughout (x lateral, y distance
// from plate, z height). Rendering converts at the seams.

import { Pitch } from "./Pitch";
import { pitchFromRow, type CachedPitchSubset } from "./averages";

const BALL_DIAMETER_FT = 0.245; // 2.94" — spread-delta threshold
const COMMIT_Y_FT = 23.8; // Baseball Prospectus commit point
const Y_STEP_FT = 0.5; // sample density along the flight
const ENVELOPE_PERCENTILE = 0.9; // tube wraps 90% of pitches at each y
const DEFAULT_MIN_PITCHES_PER_TYPE = 3;

export interface TunnelEnvelope {
  // Spine of the tube in Statcast coords, from release toward plate.
  // Always at least 2 points; first is at the release sample, last is
  // at the tunnel-end sample. y is monotonically decreasing.
  spine: Array<[number, number, number]>;
  // Radius (ft) at each spine point. Same length as spine.
  radii: number[];
  // y-coordinate where the tunnel terminates (deviation threshold
  // crossed, or 0 if the bundle never spreads beyond threshold).
  tunnelEndY: number;
  // y-coordinate of the (averaged) release point. Tunnel length =
  // releaseY - tunnelEndY.
  releaseY: number;
  stats: TunnelStats;
}

export interface TunnelStats {
  // Length of the tunnel in feet, release → first deviation. 0 if the
  // pitches deviate immediately (bad release-point consistency).
  tunnelLengthFt: number;
  // How close to the plate the tunnel reaches. Smaller = better.
  endDistanceFromPlateFt: number;
  // Max pairwise distance between per-type means at release (inches).
  releaseSpreadIn: number;
  // Max pairwise spread at the BP commit point (23.8 ft).
  commitSpreadIn: number;
  // Max pairwise spread at the plate.
  plateSpreadIn: number;
  // plateSpreadFt / commitSpreadFt — how much the bundle blooms after
  // the batter has to commit. Higher = better deception. Capped at 99
  // to avoid divide-by-near-zero blowup.
  plateToCommit: number;
  // Pitch types contributing (sorted alphabetically for stable display).
  types: string[];
  // Total pitches included in the envelope.
  n: number;
}

interface TypeSamples {
  type: string;
  // For each y in the global grid: mean (x, z) of this type's pitches
  // at that y. Null when no pitches of this type reached that y (e.g.
  // y > release_pos_y for that pitch).
  meanByY: Array<{ x: number; z: number } | null>;
}

interface BuildOptions {
  // How much extra spread (beyond the release baseline) qualifies as
  // "tunnel break", in feet. Default = 1 baseball width.
  thresholdFt?: number;
  // Override the commit point. Default = BP's 23.8 ft.
  commitY?: number;
  // Drop pitch types with fewer than this many valid pitches before
  // computing means. Avoids one-off pitch labels destabilizing the
  // centroid. Default 3.
  minPitchesPerType?: number;
}

// Public entry point. Returns null when the input can't support a
// meaningful tunnel (need ≥ 2 pitch types with valid trajectories).
export function buildTunnelEnvelope(
  pitches: CachedPitchSubset[],
  options: BuildOptions = {},
): TunnelEnvelope | null {
  const thresholdFt = options.thresholdFt ?? BALL_DIAMETER_FT;
  const commitY = options.commitY ?? COMMIT_Y_FT;
  const minPitchesPerType =
    options.minPitchesPerType ?? DEFAULT_MIN_PITCHES_PER_TYPE;

  // Bucket by pitch type, dropping rows with missing kinematics.
  const byType = new Map<string, Pitch[]>();
  for (const row of pitches) {
    const pitch = pitchFromRow(row);
    if (!pitch) continue;
    const list = byType.get(pitch.row.pitch_type) ?? [];
    list.push(pitch);
    byType.set(pitch.row.pitch_type, list);
  }
  // Drop sparse types (e.g. one stray "EP" eephus in a season) before
  // they get a chance to skew the per-type centroid.
  for (const [type, list] of byType) {
    if (list.length < minPitchesPerType) byType.delete(type);
  }
  if (byType.size < 2) return null;

  const allPitches: Pitch[] = [];
  for (const list of byType.values()) allPitches.push(...list);

  // Spine and sampling start from the AVERAGE release y. Earlier
  // versions used max(release_pos_y) which falls into outlier territory
  // — at that y only a handful of pitches per type are sampled and the
  // resulting per-type means are wildly biased, often producing a fake
  // tunnel break right at release. Anchoring to the mean keeps the
  // first sample on solid ground (most pitches contribute).
  const meanReleaseY =
    allPitches.reduce((s, p) => s + p.row.release_pos_y, 0) / allPitches.length;
  const yStart = Math.floor(meanReleaseY / Y_STEP_FT) * Y_STEP_FT;
  const ys: number[] = [];
  for (let y = yStart; y >= 0; y -= Y_STEP_FT) ys.push(Number(y.toFixed(3)));

  // Per-type mean (x, z) at each y. Note: we DO NOT skip pitches whose
  // release_pos_y falls below the current y. The Pitch's constant-
  // acceleration model extrapolates cleanly to any y, and what we want
  // here is the *abstract* relative position of each type's trajectory,
  // not whether the ball was physically airborne yet. Skipping creates
  // sampling bias that breaks the threshold check at the boundary.
  const typeSamples: TypeSamples[] = [];
  for (const [type, list] of byType) {
    const meanByY = ys.map((y) => {
      let sx = 0;
      let sz = 0;
      let n = 0;
      for (const p of list) {
        const pos = p.positionAtY(y);
        if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[2])) continue;
        sx += pos[0];
        sz += pos[2];
        n += 1;
      }
      if (n === 0) return null;
      return { x: sx / n, z: sz / n };
    });
    typeSamples.push({ type, meanByY });
  }

  // For each y: centroid of the per-type means, between-type spread
  // (max pairwise distance), and 90th-percentile distance from each
  // individual pitch to the centroid. Same "no skip" rule as above —
  // every pitch contributes via extrapolation.
  interface SampleAgg {
    y: number;
    centroid: { x: number; z: number } | null;
    betweenTypeSpread: number; // ft, NaN when < 2 types present at this y
    radius: number; // ft, percentile envelope around centroid
  }
  const aggregates: SampleAgg[] = ys.map((y, i) => {
    const present = typeSamples
      .map((t) => t.meanByY[i])
      .filter((m): m is { x: number; z: number } => m !== null);
    if (present.length === 0) {
      return { y, centroid: null, betweenTypeSpread: NaN, radius: 0 };
    }
    const cx = present.reduce((s, p) => s + p.x, 0) / present.length;
    const cz = present.reduce((s, p) => s + p.z, 0) / present.length;
    let maxPair = 0;
    for (let a = 0; a < present.length; a++) {
      for (let b = a + 1; b < present.length; b++) {
        const dx = present[a].x - present[b].x;
        const dz = present[a].z - present[b].z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > maxPair) maxPair = d;
      }
    }
    const dists: number[] = [];
    for (const p of allPitches) {
      const pos = p.positionAtY(y);
      if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[2])) continue;
      const dx = pos[0] - cx;
      const dz = pos[2] - cz;
      dists.push(Math.sqrt(dx * dx + dz * dz));
    }
    const radius = percentile(dists, ENVELOPE_PERCENTILE);
    return {
      y,
      centroid: { x: cx, z: cz },
      betweenTypeSpread: present.length >= 2 ? maxPair : NaN,
      radius,
    };
  });

  // Lookup helper — between-type spread at an exact y (linear interp
  // between the bracketing samples).
  const spreadAtY = (target: number): number => {
    let prev: SampleAgg | null = null;
    for (const s of aggregates) {
      if (!Number.isFinite(s.betweenTypeSpread)) continue;
      if (s.y >= target) {
        prev = s;
        continue;
      }
      // s.y < target; prev.y >= target → interp
      if (!prev) return s.betweenTypeSpread;
      const span = prev.y - s.y;
      const t = span > 0 ? (prev.y - target) / span : 0;
      return prev.betweenTypeSpread + (s.betweenTypeSpread - prev.betweenTypeSpread) * t;
    }
    return prev?.betweenTypeSpread ?? 0;
  };

  // Baseline = the bundle's natural release-point spread. The tunnel
  // ends only after the bundle has GROWN beyond that baseline by more
  // than the threshold. Decouples deception length from slot variance.
  const baselineSpreadFt = spreadAtY(meanReleaseY);

  // Walk from release toward plate; tunnel ends at the first sample
  // where the spread has grown by > threshold beyond baseline. Never
  // crossed → tunnel reaches the plate.
  let tunnelEndY = 0;
  for (const s of aggregates) {
    if (!Number.isFinite(s.betweenTypeSpread)) continue;
    if (s.betweenTypeSpread - baselineSpreadFt > thresholdFt) {
      tunnelEndY = s.y;
      break;
    }
  }

  // Spine + radii from release down to (and including) tunnelEndY.
  const spine: Array<[number, number, number]> = [];
  const radii: number[] = [];
  for (const s of aggregates) {
    if (s.y < tunnelEndY) break;
    if (!s.centroid) continue;
    spine.push([s.centroid.x, s.y, s.centroid.z]);
    radii.push(s.radius);
  }
  // Need at least 2 points to make a tube; a degenerate "deviates at
  // release" case still wants something visible, so synthesize a
  // 1-step stub by duplicating the release sample slightly down.
  if (spine.length < 2 && spine.length === 1) {
    const [x, y, z] = spine[0];
    spine.push([x, Math.max(0, y - Y_STEP_FT), z]);
    radii.push(radii[0]);
  }

  const releaseSpreadFt = baselineSpreadFt;
  const commitSpreadFt = spreadAtY(commitY);
  const plateSpreadFt = spreadAtY(0);
  const plateToCommit =
    commitSpreadFt > 1e-3 ? Math.min(99, plateSpreadFt / commitSpreadFt) : 99;

  return {
    spine,
    radii,
    tunnelEndY,
    releaseY: meanReleaseY,
    stats: {
      tunnelLengthFt: Math.max(0, meanReleaseY - tunnelEndY),
      endDistanceFromPlateFt: tunnelEndY,
      releaseSpreadIn: releaseSpreadFt * 12,
      commitSpreadIn: commitSpreadFt * 12,
      plateSpreadIn: plateSpreadFt * 12,
      plateToCommit,
      types: Array.from(byType.keys()).sort(),
      n: allPitches.length,
    },
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx];
}
