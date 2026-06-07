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

const VAA_HELP = (
  <>
    <p>
      <strong>Vertical Approach Angle</strong> = the steepness of the
      pitch as it crosses the plate, measured in degrees off
      horizontal. 0° = perfectly flat; more negative = steeper
      descent.
    </p>
    <p>
      Used as a stuff marker. Flat fastballs ({"≈"} -3° to -4°)
      that ride the top of the zone are elite; steep curveballs
      ({"≈"} -10°+) generate ground balls and chases below the
      zone. Two pitches with the same speed but different VAA play
      very differently to a batter.
    </p>
  </>
);

export function VAABars({ rows }: { rows: PerPitchStats[] }) {
  const usable = rows.filter((r) => r.vaa_mean != null);
  if (usable.length === 0) {
    return (
      <StatCard title="Approach angle (VAA)" help={VAA_HELP}>
        <div className="text-[11px] text-white/55 italic">
          Not enough data to compute approach angle.
        </div>
      </StatCard>
    );
  }
  const totalH = usable.length * ROW_H + 12;
  return (
    <StatCard title="Approach angle (VAA)" hint="0° = flat" help={VAA_HELP}>
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        width="100%"
        style={{ aspectRatio: `${W} / ${totalH}` }}
        className="block font-sans"
      >
        {/* 0° axis on the right */}
        <line x1={W - 24} y1={0} x2={W - 24} y2={totalH} stroke="rgba(255,255,255,0.18)" />
        <text x={W - 22} y={10} fill="rgba(255,255,255,0.45)" className="text-[9px]">0°</text>
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
                y={y + (ROW_H - 8) / 2}
                fill="rgba(255,255,255,0.85)"
                className="text-[10px]"
                dominantBaseline="middle"
              >
                {getPitchLabel(r.pitch_type)}
              </text>
              {/* Value tag at the end of the bar */}
              <text
                x={W - 28 - len + 4}
                y={y + (ROW_H - 8) / 2}
                fill="rgba(255,255,255,0.85)"
                className="text-[10px]"
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
