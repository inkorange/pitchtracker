import { Pitch } from "@/lib/pitch/Pitch";
import type { SlimPitch } from "./feature-shapes";

// Side-view tunnel diagram data for the homepage feature card: the
// average trajectory of a pitcher's most-used pitch types, projected
// onto distance-from-plate (x) vs height (y) in a fixed SVG box.

export const TUNNEL_VIEW = { w: 560, h: 260, left: 30, right: 530, top: 30, bottom: 230 };
/** Statcast y (ft from plate) where a hitter has to commit — the
 *  commonly cited ~23.8 ft "decision point" (~175 ms before contact). */
export const DECISION_Y_FT = 23.8;
const RELEASE_Y_FT = 55;

export interface TunnelLine {
  pitchType: string;
  /** SVG path `d` in TUNNEL_VIEW coordinates. */
  d: string;
}

export interface TunnelDiagram {
  lines: TunnelLine[];
  decisionX: number;
  release: { x: number; y: number };
  plate: { x: number; top: number; bottom: number };
}

const xFor = (yFt: number) =>
  TUNNEL_VIEW.left + ((RELEASE_Y_FT - yFt) / RELEASE_Y_FT) * (TUNNEL_VIEW.right - TUNNEL_VIEW.left);

export function buildTunnelDiagram(pitches: SlimPitch[], maxTypes = 3): TunnelDiagram | null {
  const byType = new Map<string, SlimPitch[]>();
  for (const p of pitches) {
    const arr = byType.get(p[12]) ?? [];
    arr.push(p);
    byType.set(p[12], arr);
  }
  const top = [...byType.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, maxTypes);
  if (top.length === 0) return null;

  const paths = top.map(([type, rows]) => {
    const avg = Array.from({ length: 12 }, (_, i) => rows.reduce((s, r) => s + (r[i] as number), 0) / rows.length);
    const pitch = new Pitch({
      release_pos_x: avg[0],
      release_pos_y: avg[1],
      release_pos_z: avg[2],
      vx0: avg[3],
      vy0: avg[4],
      vz0: avg[5],
      ax: avg[6],
      ay: avg[7],
      az: avg[8],
      plate_x: avg[9],
      plate_z: avg[10],
      release_speed: avg[11],
      pitch_type: type,
    });
    return { type, pts: pitch.path(40) };
  });

  // Fit heights into the box with a little headroom.
  const zs = paths.flatMap((p) => p.pts.map((pt) => pt[2]));
  const zMin = Math.min(...zs) - 0.3;
  const zMax = Math.max(...zs) + 0.3;
  const yFor = (z: number) =>
    TUNNEL_VIEW.bottom - ((z - zMin) / (zMax - zMin)) * (TUNNEL_VIEW.bottom - TUNNEL_VIEW.top);

  const lines = paths.map(({ type, pts }) => ({
    pitchType: type,
    d: pts
      .map((pt, i) => `${i === 0 ? "M" : "L"}${xFor(pt[1]).toFixed(1)} ${yFor(pt[2]).toFixed(1)}`)
      .join(" "),
  }));

  const first = paths[0].pts[0];
  return {
    lines,
    decisionX: xFor(DECISION_Y_FT),
    release: { x: xFor(first[1]), y: yFor(first[2]) },
    // Strike-zone band at the plate, ~1.6–3.4 ft.
    plate: { x: xFor(0), top: yFor(3.4), bottom: yFor(1.6) },
  };
}
