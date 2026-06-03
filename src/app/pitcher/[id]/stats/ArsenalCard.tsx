"use client";

import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import type { PerPitchStats } from "./aggregations";
import {
  type ArsenalRadar as ArsenalRadarData,
  RADAR_AXES,
  RADAR_AXIS_LABELS,
  type RadarPitch,
} from "@/lib/pitch/arsenalRadar";
import { StatCard } from "./StatCard";

// Top-of-page Arsenal card. Consolidates what used to be two
// separate stat cards — PerPitchTable (use% / velo / CSW% / whiff%)
// and ArsenalRadar (league-percentile spider chart per pitch type)
// — into one full-width section. The duplicate "which pitches he
// throws" listing collapses to a single source of truth.
//
// Layout: one row per pitch type. The numeric stats sit on the left
// in a label/value grid; the league-percentile radar sits on the
// right. On lg+ they share a row; on smaller widths the radar drops
// below its stats.

interface ArsenalCardProps {
  perPitch: PerPitchStats[];
  radar: ArsenalRadarData | null;
  totalPitches: number;
}

const ARSENAL_HELP = (
  <>
    <p>
      Per-pitch-type breakdown of the pitcher&apos;s arsenal in the
      current filter scope. One tile per pitch type, sorted by usage.
    </p>
    <p>
      Tile stats: <strong>Velo</strong> = average release speed (mph);
      <strong> CSW%</strong> = Called + Swinging strike rate (the
      industry headline for pitching-arsenal quality);
      <strong> Whiff%</strong> = swings-and-misses divided by swings;
      <strong> VAA</strong> = vertical approach angle at the plate
      (more negative = steeper).
    </p>
    <p>
      The mini-radar at the bottom plots <strong>league percentile</strong>{" "}
      across five axes — Velocity, Spin, induced Vertical Break,
      Horizontal Break, Whiff% — so you can see where each pitch
      ranks vs every MLB pitcher who threw that same pitch type
      this season. Bigger polygon = better stuff. The radar is
      season-wide (independent of any current filter on the page).
    </p>
  </>
);

export function ArsenalCard({ perPitch, radar, totalPitches }: ArsenalCardProps) {
  if (perPitch.length === 0) {
    return (
      <StatCard title="Arsenal" help={ARSENAL_HELP}>
        <div className="text-[11px] text-white/55 italic">
          No pitches in the current filter.
        </div>
      </StatCard>
    );
  }

  // Look up radar by pitch type so each row can pair stats + radar
  // without forcing the two lists into the same order.
  const radarByType = new Map<string, RadarPitch>(
    radar?.pitches.map((p) => [p.pitch_type, p]) ?? [],
  );

  const hint = radar
    ? `${totalPitches} pitches · vs league n≥${radar.minPitchesForLeague}`
    : `${totalPitches} pitches`;

  return (
    <StatCard title="Arsenal" hint={hint} help={ARSENAL_HELP}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {perPitch.map((p) => (
          <ArsenalTile
            key={p.pitch_type}
            stats={p}
            radar={radarByType.get(p.pitch_type) ?? null}
          />
        ))}
      </div>
    </StatCard>
  );
}

// One self-contained mini-card per pitch type. Reads like a baseball
// card: header (dot + name + usage), stats row, radar. Multi-column
// grid on desktop keeps the whole arsenal in view without scrolling
// — the prior single-row layout had ~40% empty horizontal space.
function ArsenalTile({
  stats,
  radar,
}: {
  stats: PerPitchStats;
  radar: RadarPitch | null;
}) {
  const color = getPitchColor(stats.pitch_type);
  const label = getPitchLabel(stats.pitch_type);
  return (
    <div className="rounded-md border border-white/[0.07] bg-white/[0.02] p-3 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: color }}
            aria-hidden
          />
          <span className="text-sm font-medium text-white/95 truncate">
            {label}
          </span>
        </div>
        <span className="text-[11px] text-white/55 tabular-nums whitespace-nowrap">
          {stats.usage_pct.toFixed(0)}%
          <span className="text-white/35 ml-1">({stats.pitches})</span>
        </span>
      </div>
      <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-[10.5px] tabular-nums">
        <Stat
          label="Velo"
          value={stats.velo_mean != null ? stats.velo_mean.toFixed(1) : "—"}
          suffix="mph"
        />
        <Stat
          label="CSW"
          value={stats.csw_pct.toFixed(1)}
          suffix="%"
        />
        <Stat
          label="Whiff"
          value={stats.whiff_pct.toFixed(1)}
          suffix="%"
        />
        <Stat
          label="VAA"
          value={stats.vaa_mean != null ? stats.vaa_mean.toFixed(1) : "—"}
          suffix="°"
        />
      </div>
      {radar ? (
        <MiniRadar pitch={radar} color={color} />
      ) : (
        <div className="text-[10px] text-white/35 italic py-4 text-center">
          No league data
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-[0.14em] text-white/40">
        {label}
      </span>
      <span className="text-white/95">
        {value}
        {suffix ? (
          <span className="text-white/45 ml-0.5 text-[9px]">{suffix}</span>
        ) : null}
      </span>
    </div>
  );
}

// Inline mini-radar — tighter than the standalone version so it fits
// next to the row stats. Same five percentile axes; same color as
// the row's pitch dot. Rings + spokes provide enough scale context
// without needing axis labels (which would crowd at this size).
const SIZE = 170;
const RADIUS = 55;
const PAD_X = 22;
const PAD_TOP = 18;

function MiniRadar({ pitch, color }: { pitch: RadarPitch; color: string }) {
  const cx = PAD_X + RADIUS;
  const cy = PAD_TOP + RADIUS;
  const width = RADIUS * 2 + PAD_X * 2;
  const height = RADIUS * 2 + PAD_TOP + 14;
  const N = RADAR_AXES.length;
  const angleFor = (i: number) => -Math.PI / 2 + (i / N) * 2 * Math.PI;
  const ringLevels = [0.25, 0.5, 0.75, 1];

  const points = RADAR_AXES.map((axis, i) => {
    const pct = Number.isFinite(pitch.percentile[axis])
      ? pitch.percentile[axis]
      : 0;
    const r = RADIUS * Math.max(0, Math.min(1, pct));
    const a = angleFor(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), axis };
  });
  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ aspectRatio: `${width} / ${height}`, maxWidth: SIZE }}
      className="block font-sans mx-auto"
      role="img"
      aria-label={`${pitch.pitch_type} league-percentile radar`}
    >
      {ringLevels.map((level) => (
        <polygon
          key={`ring-${level}`}
          points={RADAR_AXES.map((_, i) => {
            const a = angleFor(i);
            const r = RADIUS * level;
            return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
          }).join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={level === 1 ? 1 : 0.75}
        />
      ))}
      {RADAR_AXES.map((_, i) => {
        const a = angleFor(i);
        return (
          <line
            key={`spoke-${i}`}
            x1={cx}
            y1={cy}
            x2={cx + RADIUS * Math.cos(a)}
            y2={cy + RADIUS * Math.sin(a)}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.75}
          />
        );
      })}
      <polygon
        points={polygon}
        fill={color}
        fillOpacity={0.4}
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={`v-${i}`} cx={p.x} cy={p.y} r={2} fill={color} />
      ))}
      {/* Axis labels around the outside — small enough to fit but
          still readable for the analytical user who wants to know
          which axis is which. */}
      {RADAR_AXES.map((axis, i) => {
        const a = angleFor(i);
        const labelR = RADIUS + 9;
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
            fill="rgba(255,255,255,0.5)"
            fontSize={8}
            textAnchor={anchor}
            dominantBaseline="middle"
          >
            {RADAR_AXIS_LABELS[axis]}
          </text>
        );
      })}
    </svg>
  );
}
