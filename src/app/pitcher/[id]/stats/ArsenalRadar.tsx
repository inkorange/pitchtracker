"use client";

import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import {
  type ArsenalRadar as ArsenalRadarData,
  RADAR_AXES,
  RADAR_AXIS_LABELS,
  type RadarPitch,
} from "@/lib/pitch/arsenalRadar";
import { StatCard } from "./StatCard";

// Pitch-shape arsenal radar. One small radar (spider) chart per
// pitch type, laid out as small-multiples. Each axis is the
// pitcher's league percentile for that (pitch_type, metric) — so a
// 50% point on the velo axis means "median velocity among all
// league pitchers throwing this pitch type", and 100% means league
// leader for that pitch.
//
// Polygon color follows the existing pitch palette so the user can
// recognize the pitch without reading the label. Background rings
// at 25/50/75/100% show where the league bands fall.

interface ArsenalRadarProps {
  data: ArsenalRadarData | null;
}

const RADAR_SIZE = 150;
const RADAR_RADIUS = 56;
const RADAR_PAD_TOP = 18;
const RADAR_PAD_SIDE = 18;

export function ArsenalRadar({ data }: ArsenalRadarProps) {
  if (!data || data.pitches.length === 0) {
    return (
      <StatCard title="Arsenal radar">
        <div className="text-[11px] text-white/55 italic">
          Not enough league data to compute percentile radars for this
          pitcher.
        </div>
      </StatCard>
    );
  }

  return (
    <StatCard
      title="Arsenal radar"
      hint={`vs league · n≥${data.minPitchesForLeague}`}
    >
      <div className="space-y-2">
        <div className="text-[10px] text-white/45 leading-relaxed">
          Each axis is the pitcher&apos;s league percentile for that pitch
          type. Bigger polygon = better stuff.
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.pitches.map((p) => (
            <RadarChart key={p.pitch_type} pitch={p} />
          ))}
        </div>
      </div>
    </StatCard>
  );
}

function RadarChart({ pitch }: { pitch: RadarPitch }) {
  const color = getPitchColor(pitch.pitch_type);
  const label = getPitchLabel(pitch.pitch_type);
  const cx = RADAR_PAD_SIDE + RADAR_RADIUS;
  const cy = RADAR_PAD_TOP + RADAR_RADIUS;
  const width = RADAR_RADIUS * 2 + RADAR_PAD_SIDE * 2;
  const height = RADAR_RADIUS * 2 + RADAR_PAD_TOP + 26;

  // Each axis spaced evenly around the polygon; axis 0 sits at the
  // top (12 o'clock).
  const N = RADAR_AXES.length;
  const angleFor = (i: number) => -Math.PI / 2 + (i / N) * 2 * Math.PI;

  // Background rings — 25/50/75/100 percentile bands.
  const ringLevels = [0.25, 0.5, 0.75, 1];

  // Vertex per axis at the pitcher's percentile distance. Anything
  // missing renders at 0 (origin) so the polygon clearly collapses
  // on that axis instead of disappearing.
  const points = RADAR_AXES.map((axis, i) => {
    const pct = Number.isFinite(pitch.percentile[axis])
      ? pitch.percentile[axis]
      : 0;
    const r = RADAR_RADIUS * Math.max(0, Math.min(1, pct));
    const a = angleFor(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), axis, pct };
  });
  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ aspectRatio: `${width} / ${height}` }}
        className="block font-sans"
        role="img"
        aria-label={`${label} radar`}
      >
        {/* Ring grid. */}
        {ringLevels.map((level) => (
          <polygon
            key={`ring-${level}`}
            points={RADAR_AXES.map((_, i) => {
              const a = angleFor(i);
              const r = RADAR_RADIUS * level;
              return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
            }).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={level === 1 ? 1 : 0.75}
          />
        ))}
        {/* Axis spokes. */}
        {RADAR_AXES.map((_, i) => {
          const a = angleFor(i);
          return (
            <line
              key={`spoke-${i}`}
              x1={cx}
              y1={cy}
              x2={cx + RADAR_RADIUS * Math.cos(a)}
              y2={cy + RADAR_RADIUS * Math.sin(a)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={0.75}
            />
          );
        })}
        {/* Filled percentile polygon. */}
        <polygon
          points={polygon}
          fill={color}
          fillOpacity={0.4}
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {/* Vertex dots. */}
        {points.map((p, i) => (
          <circle key={`v-${i}`} cx={p.x} cy={p.y} r={2} fill={color} />
        ))}
        {/* Axis labels arranged around the polygon. */}
        {RADAR_AXES.map((axis, i) => {
          const a = angleFor(i);
          const labelR = RADAR_RADIUS + 9;
          const lx = cx + labelR * Math.cos(a);
          const ly = cy + labelR * Math.sin(a);
          const anchor =
            Math.abs(Math.cos(a)) < 0.2
              ? "middle"
              : Math.cos(a) > 0
                ? "start"
                : "end";
          return (
            <text
              key={`l-${i}`}
              x={lx}
              y={ly}
              fill="rgba(255,255,255,0.55)"
              fontSize={8}
              textAnchor={anchor}
              dominantBaseline="middle"
            >
              {RADAR_AXIS_LABELS[axis]}
            </text>
          );
        })}
        {/* Pitch label + count below the chart. */}
        <text
          x={width / 2}
          y={cy + RADAR_RADIUS + 18}
          fill="rgba(255,255,255,0.95)"
          fontSize={11}
          fontWeight={600}
          textAnchor="middle"
        >
          {label}
        </text>
        <text
          x={width / 2}
          y={cy + RADAR_RADIUS + 28}
          fill="rgba(255,255,255,0.45)"
          fontSize={9}
          textAnchor="middle"
        >
          n={pitch.pitchCount}
        </text>
      </svg>
    </div>
  );
}
