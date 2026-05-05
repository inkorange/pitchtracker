// Tunneling math: given two pitch trajectories, find where their paths
// stay close ("tunnel") and where they diverge.
//
// PLAN.md / IMPLEMENTATION.md definitions:
//   - threshold: max distance for paths to be considered "tunneling"
//     (default 1.5 inches = 0.125 ft per pitching-coach convention)
//   - commit point: distance from plate where the hitter must commit
//     to swing (~25 ft, ~175ms before plate at typical velocity)
//   - tunnel point: latest y position (distance from plate) where the
//     two paths are still within `threshold` of each other
//   - tunnel quality score: plate-distance / commit-distance — higher
//     means the pitches looked the same at commit but diverged late.
//
// We sample the pitches at a fine y-spacing and evaluate distance at
// each y. This lets us return both the tunnel-y and a sampled curve
// of distance-vs-y that callers can render.

import type { Pitch } from "./Pitch";

const DEFAULT_THRESHOLD_FT = 0.125; // 1.5 inches
const DEFAULT_COMMIT_Y = 25;
const DEFAULT_PLATE_Y = 0;

export interface TunnelStats {
  // y-coordinate (ft from plate) where the two paths last fall within
  // `thresholdFt`. Null if the paths never tunnel within threshold.
  tunnelY: number | null;
  // Distance between paths at the commit point (ft).
  commitDistance: number;
  // Distance between paths at the plate (ft).
  plateDistance: number;
  // Tunnel quality score: plateDistance / commitDistance.
  // Higher = better tunnel (paths look the same at commit, diverge late).
  qualityScore: number;
  // Threshold used (ft).
  thresholdFt: number;
  // Commit y used (ft).
  commitY: number;
}

interface ComputeOptions {
  thresholdFt?: number;
  commitY?: number;
  plateY?: number;
}

function distanceAtY(a: Pitch, b: Pitch, y: number): number {
  const pa = a.positionAtY(y);
  const pb = b.positionAtY(y);
  const dx = pa[0] - pb[0];
  const dy = pa[2] - pb[2]; // height difference (Statcast z)
  return Math.sqrt(dx * dx + dy * dy);
}

export function computeTunnelStats(
  a: Pitch,
  b: Pitch,
  options: ComputeOptions = {},
): TunnelStats {
  const thresholdFt = options.thresholdFt ?? DEFAULT_THRESHOLD_FT;
  const commitY = options.commitY ?? DEFAULT_COMMIT_Y;
  const plateY = options.plateY ?? DEFAULT_PLATE_Y;

  // Sample from the smaller of the two release_pos_y values (so both
  // pitches are airborne at every sampled y) down to the plate.
  const yStart = Math.min(a.row.release_pos_y, b.row.release_pos_y);
  // 0.5 ft step → 110 samples for a typical pitch. Plenty for finding
  // the latest threshold-crossing without being expensive.
  const step = 0.5;
  let tunnelY: number | null = null;
  for (let y = yStart; y >= plateY; y -= step) {
    const d = distanceAtY(a, b, y);
    if (d <= thresholdFt) tunnelY = y;
  }

  const commitDistance = distanceAtY(a, b, commitY);
  const plateDistance = distanceAtY(a, b, plateY);
  const qualityScore = commitDistance > 1e-6 ? plateDistance / commitDistance : 0;

  return {
    tunnelY,
    commitDistance,
    plateDistance,
    qualityScore,
    thresholdFt,
    commitY,
  };
}

// Sampled distance curve, useful for rendering or fine-grained analysis.
export interface DistanceSample {
  y: number;
  distance: number;
}

export function sampleDistance(
  a: Pitch,
  b: Pitch,
  options: { plateY?: number; step?: number } = {},
): DistanceSample[] {
  const plateY = options.plateY ?? DEFAULT_PLATE_Y;
  const step = options.step ?? 0.5;
  const yStart = Math.min(a.row.release_pos_y, b.row.release_pos_y);
  const out: DistanceSample[] = [];
  for (let y = yStart; y >= plateY; y -= step) {
    out.push({ y, distance: distanceAtY(a, b, y) });
  }
  return out;
}
