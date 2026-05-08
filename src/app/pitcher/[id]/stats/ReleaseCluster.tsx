"use client";

import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import type { StatPitch } from "./aggregations";
import { StatCard } from "./StatCard";

// Release-point scatter: release_pos_x (horizontal, ft from rubber
// midline) on x, release_pos_z (height, ft) on y. Camera POV — i.e.,
// the catcher's looking at the pitcher.
//
// Tight cross-pitch-type clusters mean the hitter sees every pitch
// leave the same point; that's the "tunneling at the hand" property.
const SIZE = 280;
const PADDING = 28;
// Reasonable bounding box: ±4 ft horizontal, 2 → 7 ft vertical.
const X_RANGE: [number, number] = [-4, 4];
const Z_RANGE: [number, number] = [2, 7.5];

function xToSvg(x: number): number {
  const t = (x - X_RANGE[0]) / (X_RANGE[1] - X_RANGE[0]);
  return PADDING + t * (SIZE - PADDING * 2);
}

function zToSvg(z: number): number {
  const t = (z - Z_RANGE[0]) / (Z_RANGE[1] - Z_RANGE[0]);
  // Flip Y — higher z = higher in SVG (lower y value).
  return SIZE - PADDING - t * (SIZE - PADDING * 2);
}

export function ReleaseCluster({ pitches }: { pitches: StatPitch[] }) {
  const usable = pitches.filter(
    (p) =>
      p.release_pos_x != null &&
      p.release_pos_z != null &&
      Number.isFinite(p.release_pos_x) &&
      Number.isFinite(p.release_pos_z) &&
      p.pitch_type,
  );
  const types = new Set<string>();
  for (const p of usable) types.add(p.pitch_type!);
  const orderedTypes = Array.from(types).sort();

  return (
    <StatCard title="Release point" hint="ft · catcher's POV">
      <div className="w-full">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width="100%"
          style={{ aspectRatio: "1 / 1" }}
          className="block"
        >
          <rect width={SIZE} height={SIZE} fill="rgba(255,255,255,0.02)" rx={8} />
          {/* Grid: vertical lines at every foot, horizontal at every foot of height */}
          <g stroke="rgba(255,255,255,0.06)" strokeWidth={1}>
            {[-3, -2, -1, 0, 1, 2, 3].map((v) => (
              <line key={`vx-${v}`} x1={xToSvg(v)} y1={PADDING} x2={xToSvg(v)} y2={SIZE - PADDING} />
            ))}
            {[3, 4, 5, 6, 7].map((v) => (
              <line key={`vy-${v}`} x1={PADDING} y1={zToSvg(v)} x2={SIZE - PADDING} y2={zToSvg(v)} />
            ))}
          </g>
          {/* Center vertical (mound midline) */}
          <line x1={xToSvg(0)} y1={PADDING} x2={xToSvg(0)} y2={SIZE - PADDING} stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3 3" />
          {/* Per-pitch dots */}
          {usable.map((p, i) => (
            <circle
              key={`r-${i}`}
              cx={xToSvg(p.release_pos_x!)}
              cy={zToSvg(p.release_pos_z!)}
              r={1.6}
              fill={getPitchColor(p.pitch_type!)}
              fillOpacity={0.45}
            />
          ))}
          {/* Y-axis ticks (height) */}
          <g fill="rgba(255,255,255,0.4)" fontSize={8} fontFamily="ui-sans-serif">
            {[3, 4, 5, 6, 7].map((v) => (
              <text key={`tz-${v}`} x={4} y={zToSvg(v) + 3}>
                {v}ft
              </text>
            ))}
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-white/65">
        {orderedTypes.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: getPitchColor(t) }} aria-hidden />
            {getPitchLabel(t)}
          </span>
        ))}
      </div>
    </StatCard>
  );
}
