// Build a synthetic "average" Pitch per pitch type from a set of cached
// pitches. Used by the comparison view, where rendering every individual
// pitch makes the scene noisy — the IMPLEMENTATION default is bold
// average ribbons with the cloud layer as a toggle.
//
// Averaging trajectory parameters (release, v0, a) is a reasonable
// approximation for pitchers with consistent mechanics. For a more
// rigorous average we'd sample per-y-position and average those, which
// is a future refinement.

import { Pitch, type StatcastRow } from "./Pitch";

export interface CachedPitchSubset {
  pitch_type: string | null;
  release_pos_x: number | null;
  release_pos_y: number | null;
  release_pos_z: number | null;
  vx0: number | null;
  vy0: number | null;
  vz0: number | null;
  ax: number | null;
  ay: number | null;
  az: number | null;
  plate_x: number | null;
  plate_z: number | null;
  release_speed: number | null;
}

const REQUIRED: Array<keyof CachedPitchSubset> = [
  "release_pos_x",
  "release_pos_y",
  "release_pos_z",
  "vx0",
  "vy0",
  "vz0",
  "ax",
  "ay",
  "az",
];

function isValid(p: CachedPitchSubset): boolean {
  return REQUIRED.every((k) => p[k] != null);
}

// Build a single Pitch from one cached row. Returns null if any required
// kinematic field is missing.
export function pitchFromRow(row: CachedPitchSubset): Pitch | null {
  if (!row.pitch_type) return null;
  if (!isValid(row)) return null;
  const statcast: StatcastRow = {
    release_pos_x: row.release_pos_x as number,
    release_pos_y: row.release_pos_y as number,
    release_pos_z: row.release_pos_z as number,
    vx0: row.vx0 as number,
    vy0: row.vy0 as number,
    vz0: row.vz0 as number,
    ax: row.ax as number,
    ay: row.ay as number,
    az: row.az as number,
    plate_x: row.plate_x ?? 0,
    plate_z: row.plate_z ?? 0,
    release_speed: row.release_speed ?? 0,
    pitch_type: row.pitch_type,
  };
  try {
    return new Pitch(statcast);
  } catch {
    return null;
  }
}

export function averagePitchesByType(
  pitches: CachedPitchSubset[],
): Map<string, Pitch> {
  const groups = new Map<string, CachedPitchSubset[]>();
  for (const p of pitches) {
    if (!p.pitch_type) continue;
    if (!isValid(p)) continue;
    const list = groups.get(p.pitch_type) ?? [];
    list.push(p);
    groups.set(p.pitch_type, list);
  }

  const result = new Map<string, Pitch>();
  for (const [type, list] of groups) {
    const n = list.length;
    const avg = (k: keyof CachedPitchSubset) =>
      list.reduce((sum, p) => sum + ((p[k] as number) ?? 0), 0) / n;

    const row: StatcastRow = {
      release_pos_x: avg("release_pos_x"),
      release_pos_y: avg("release_pos_y"),
      release_pos_z: avg("release_pos_z"),
      vx0: avg("vx0"),
      vy0: avg("vy0"),
      vz0: avg("vz0"),
      ax: avg("ax"),
      ay: avg("ay"),
      az: avg("az"),
      plate_x: avg("plate_x"),
      plate_z: avg("plate_z"),
      release_speed: avg("release_speed"),
      pitch_type: type,
    };
    result.set(type, new Pitch(row));
  }
  return result;
}
