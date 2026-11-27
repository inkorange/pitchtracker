import type { SlimPitch } from "@/lib/home/feature-shapes";
import { getPitchColor } from "@/lib/viz/colors";

// Static poster for the 3D monitor: each pitch's plate crossing as a
// dot, catcher's view, over a dark field. Server-renderable, so the
// hero shows real data before (or without) WebGL.
//
// View box spans ±2.5 ft laterally and 0–5 ft vertically.
const W = 500;
const H = 500;
const toX = (plateX: number) => ((plateX + 2.5) / 5) * W;
const toY = (plateZ: number) => H - (plateZ / 5) * H;

export function PlateDotsPoster({
  pitches,
  className = "",
}: {
  pitches: SlimPitch[];
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,#14304a_0%,var(--bg)_75%)] ${className}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full">
        {/* Strike zone: ±0.83 ft, ~1.6–3.4 ft. */}
        <rect
          x={toX(-0.83)}
          y={toY(3.4)}
          width={toX(0.83) - toX(-0.83)}
          height={toY(1.6) - toY(3.4)}
          fill="none"
          stroke="#c4ccdb"
          strokeOpacity={0.6}
          strokeWidth={1.5}
        />
        {pitches.map((p, i) => (
          <circle
            key={i}
            cx={toX(p[9])}
            cy={toY(p[10])}
            r={3.5}
            fill={getPitchColor(p[12])}
            fillOpacity={0.55}
          />
        ))}
      </svg>
    </div>
  );
}
