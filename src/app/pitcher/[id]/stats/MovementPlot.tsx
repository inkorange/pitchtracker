"use client";

import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import type { StatPitch } from "./aggregations";
import { StatCard } from "./StatCard";

// Movement plot: horizontal break (HB) on x, induced vertical break
// (iVB) on y. Both axes in INCHES (Statcast pfx_x / pfx_z are in feet
// — multiply by 12). Convention: from the catcher's POV, +HB =
// arm-side, +iVB = backspin lift.
//
// One dot per pitch, colored by pitch type. Pitch colors are shared
// with the 3D scene and the per-pitch table so the eye groups types
// across the whole Stats view without a per-card legend.
const SIZE = 280;
const PADDING = 32;
const RANGE = 24; // ±24 inches covers virtually every MLB pitch
const ZERO = SIZE / 2;
const SCALE = (SIZE - PADDING * 2) / (2 * RANGE);

export function MovementPlot({ pitches }: { pitches: StatPitch[] }) {
  const usable = pitches.filter(
    (p) =>
      p.pfx_x != null &&
      p.pfx_z != null &&
      Number.isFinite(p.pfx_x) &&
      Number.isFinite(p.pfx_z) &&
      p.pitch_type,
  );
  // Group dots by pitch type so we can also draw a per-type centroid
  // ring. Centroids are what the eye locks onto when comparing.
  const byType = new Map<string, Array<{ hb: number; ivb: number }>>();
  for (const p of usable) {
    if (!p.pitch_type) continue;
    const arr = byType.get(p.pitch_type) ?? [];
    arr.push({
      hb: (p.pfx_x ?? 0) * 12,
      ivb: (p.pfx_z ?? 0) * 12,
    });
    byType.set(p.pitch_type, arr);
  }
  const types = Array.from(byType.keys()).sort();

  return (
    <StatCard title="Movement" hint="HB · iVB (in)">
      <div className="w-full">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width="100%"
          style={{ aspectRatio: "1 / 1" }}
          className="block"
        >
          {/* Background */}
          <rect width={SIZE} height={SIZE} fill="rgba(255,255,255,0.02)" rx={8} />
          {/* Grid lines every 6 inches */}
          <g stroke="rgba(255,255,255,0.08)" strokeWidth={1}>
            {[-18, -12, -6, 6, 12, 18].map((v) => (
              <line key={`vx-${v}`} x1={ZERO + v * SCALE} y1={PADDING} x2={ZERO + v * SCALE} y2={SIZE - PADDING} />
            ))}
            {[-18, -12, -6, 6, 12, 18].map((v) => (
              <line key={`vy-${v}`} x1={PADDING} y1={ZERO - v * SCALE} x2={SIZE - PADDING} y2={ZERO - v * SCALE} />
            ))}
          </g>
          {/* Axes */}
          <g stroke="rgba(255,255,255,0.25)" strokeWidth={1}>
            <line x1={PADDING} y1={ZERO} x2={SIZE - PADDING} y2={ZERO} />
            <line x1={ZERO} y1={PADDING} x2={ZERO} y2={SIZE - PADDING} />
          </g>
          {/* Axis labels */}
          <g fill="rgba(255,255,255,0.45)" fontSize={9} fontFamily="ui-sans-serif">
            <text x={SIZE - PADDING + 2} y={ZERO + 3}>+HB</text>
            <text x={ZERO + 3} y={PADDING - 4}>+iVB</text>
            <text x={PADDING - 16} y={ZERO + 3}>−HB</text>
            <text x={ZERO + 3} y={SIZE - PADDING + 10}>−iVB</text>
          </g>
          {/* Per-pitch dots */}
          {usable.map((p, i) => {
            const cx = ZERO + (p.pfx_x ?? 0) * 12 * SCALE;
            const cy = ZERO - (p.pfx_z ?? 0) * 12 * SCALE;
            return (
              <circle
                key={`p-${i}`}
                cx={cx}
                cy={cy}
                r={1.5}
                fill={getPitchColor(p.pitch_type ?? "")}
                fillOpacity={0.55}
              />
            );
          })}
          {/* Centroid rings — one per pitch type. Bigger ring + label. */}
          {types.map((t) => {
            const pts = byType.get(t)!;
            const meanHb = pts.reduce((a, b) => a + b.hb, 0) / pts.length;
            const meanIvb = pts.reduce((a, b) => a + b.ivb, 0) / pts.length;
            const cx = ZERO + meanHb * SCALE;
            const cy = ZERO - meanIvb * SCALE;
            return (
              <g key={`c-${t}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={6}
                  fill="none"
                  stroke={getPitchColor(t)}
                  strokeWidth={1.8}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={2.5}
                  fill={getPitchColor(t)}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-white/65">
        {types.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: getPitchColor(t) }}
              aria-hidden
            />
            {getPitchLabel(t)}
          </span>
        ))}
      </div>
    </StatCard>
  );
}
