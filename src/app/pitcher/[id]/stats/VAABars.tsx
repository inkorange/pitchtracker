"use client";

import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import type { PerPitchStats } from "./aggregations";
import { StatCard } from "./StatCard";

// Vertical Approach Angle per pitch type. Convention: VAA is negative
// (ball descending into the zone). Closer to 0° = "flat" — flat
// fastballs are the modern weapon at the top of the zone. Bars
// extend from a 0° baseline downward; the more negative, the longer.
//
// Reference points (rough MLB averages):
//   four-seam fastball  ~ -4.5°
//   sinker              ~ -6.5°
//   curveball           ~ -10°+
const W = 280;
const ROW_H = 22;
const VAA_RANGE = 14; // degrees from 0 to -14

export function VAABars({ rows }: { rows: PerPitchStats[] }) {
  const usable = rows.filter((r) => r.vaa_mean != null);
  if (usable.length === 0) {
    return (
      <StatCard title="Approach angle (VAA)">
        <div className="text-[11px] text-white/55 italic">
          Not enough data to compute approach angle.
        </div>
      </StatCard>
    );
  }
  const totalH = usable.length * ROW_H + 12;
  return (
    <StatCard title="Approach angle (VAA)" hint="0° = flat">
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        width="100%"
        style={{ aspectRatio: `${W} / ${totalH}` }}
        className="block"
      >
        {/* 0° axis on the right */}
        <line x1={W - 24} y1={0} x2={W - 24} y2={totalH} stroke="rgba(255,255,255,0.18)" />
        <text x={W - 22} y={10} fill="rgba(255,255,255,0.45)" fontSize={9} fontFamily="ui-sans-serif">0°</text>
        {usable.map((r, i) => {
          const vaa = r.vaa_mean!;
          const len = Math.min(W - 60, (Math.abs(vaa) / VAA_RANGE) * (W - 60));
          const y = i * ROW_H + 6;
          return (
            <g key={r.pitch_type}>
              {/* Bar grows leftward from the 0° axis at right */}
              <rect
                x={W - 24 - len}
                y={y}
                width={len}
                height={ROW_H - 8}
                fill={getPitchColor(r.pitch_type)}
                fillOpacity={0.7}
                rx={2}
              />
              {/* Label on the left */}
              <text
                x={4}
                y={y + ROW_H / 2}
                fill="rgba(255,255,255,0.85)"
                fontSize={10}
                fontFamily="ui-sans-serif"
                dominantBaseline="middle"
              >
                {getPitchLabel(r.pitch_type)}
              </text>
              {/* Value tag at the end of the bar */}
              <text
                x={W - 28 - len + 4}
                y={y + ROW_H / 2}
                fill="rgba(255,255,255,0.85)"
                fontSize={10}
                fontFamily="ui-sans-serif"
                dominantBaseline="middle"
              >
                {vaa.toFixed(1)}°
              </text>
            </g>
          );
        })}
      </svg>
    </StatCard>
  );
}
