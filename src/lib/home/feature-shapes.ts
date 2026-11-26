import type { SavantSeasonPitchRow } from "@/lib/cache/savant-season";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";

// Pure shapes + helpers for the homepage feature data. Kept apart from
// feature-data.ts (which imports server-only loaders) so client
// components and tests can use them.

/** Cap on pitches sent to the monitor. Paths are drawn at low opacity,
 *  so an even sample of the season is visually indistinguishable from
 *  the whole thing at a fraction of the payload (~60 KB). */
export const MONITOR_SAMPLE = 800;

/**
 * Compact trajectory tuple:
 * [release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay,
 *  az, plate_x, plate_z, release_speed, pitch_type]
 */
export type SlimPitch = [
  number, number, number,
  number, number, number,
  number, number, number,
  number, number, number,
  string,
];

export interface ArsenalBar {
  type: string;
  label: string;
  color: string;
  mph: string;
  /** Usage share, 0–100, rounded. */
  pct: number;
  count: number;
}

export interface FeaturedAtBatPitch {
  n: number;
  type: string;
  label: string;
  color: string;
  mph: string;
  plateX: number | null;
  plateZ: number | null;
}

export interface FeaturedAtBat {
  href: string;
  pitcherShort: string;
  batterShort: string;
  date: string | null;
  pitches: FeaturedAtBatPitch[];
}

export interface HomeFeature {
  season: number;
  pitcher: {
    id: number;
    name: string;
    shortName: string;
    href: string;
    teamAbbr: string | null;
    /** "RHP" / "LHP" / null */
    role: string | null;
  };
  pitchCount: number;
  pitchTypeCount: number;
  monitorPitches: SlimPitch[];
  arsenal: ArsenalBar[];
  atBat: FeaturedAtBat | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Evenly sample `rows` down to at most `max` entries, keeping order. */
export function evenSample<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(rows[Math.floor(i * step)]);
  return out;
}

export function toSlimPitch(p: SavantSeasonPitchRow): SlimPitch | null {
  const f = [
    p.release_pos_x, p.release_pos_y, p.release_pos_z,
    p.vx0, p.vy0, p.vz0,
    p.ax, p.ay, p.az,
  ];
  if (f.some((v) => v == null)) return null;
  return [
    ...(f as number[]).map(r3),
    r3(p.plate_x ?? 0),
    r3(p.plate_z ?? 0),
    r3(p.release_speed ?? 0),
    p.pitch_type ?? "UN",
  ] as SlimPitch;
}

export function buildArsenal(
  arsenal: { pitch_type: string; pitch_count: number; avg_velocity: number | null }[],
): ArsenalBar[] {
  const total = arsenal.reduce((s, a) => s + a.pitch_count, 0);
  if (total === 0) return [];
  return arsenal.map((a) => ({
    type: a.pitch_type,
    label: getPitchLabel(a.pitch_type),
    color: getPitchColor(a.pitch_type),
    mph: a.avg_velocity != null ? a.avg_velocity.toFixed(1) : "—",
    pct: Math.round((a.pitch_count / total) * 100),
    count: a.pitch_count,
  }));
}

