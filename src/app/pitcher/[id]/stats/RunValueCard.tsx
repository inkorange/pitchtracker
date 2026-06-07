"use client";

import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import { type PerPitchStats, RV_PER_100_MIN_N } from "./aggregations";
import { StatCard } from "./StatCard";

// One diverging horizontal bar per pitch type, sorted descending by
// rv_sum (most-saves at the top). Pitcher frame: positive = saved
// runs, bar grows right; negative = allowed runs, bar grows left.
//
// Bars normalized to the max |rv_sum| in the set so the longest row
// fills the row. Per-100 cell is muted secondary text and is hidden
// when rv_n < RV_PER_100_MIN_N (suppressed by aggregations).
const W = 320;
const ROW_H = 22;
// Below this rate (runs per 100 pitches lost), show a warning glyph.
// Half a run per 100 thrown is bad; 1.0+ is the "this pitch is
// actively costing him games" threshold.
const RV_PER_100_WARN = -1.0;

const RV_HELP = (
  <>
    <p>
      <strong>Run Value</strong> is the sum of how much each pitch
      shifted the offense&apos;s expected runs in the inning. Negative
      for the offense = saved for the pitcher; this card flips the
      sign so positive numbers and right-of-zero bars mean &quot;runs
      saved.&quot;
    </p>
    <p>
      <strong>Total</strong> is volume — what actually moved the
      scoreboard this season. <strong>/100</strong> is rate — how
      good the pitch is on average, normalized per 100 pitches.
      Hidden when the bucket has fewer than {RV_PER_100_MIN_N}
      pitches (too noisy).
    </p>
  </>
);

function formatRv(rv: number): string {
  const sign = rv > 0 ? "+" : rv < 0 ? "−" : "";
  return `${sign}${Math.abs(rv).toFixed(1)}`;
}

function formatRvPer100(rate: number): string {
  const sign = rate > 0 ? "+" : rate < 0 ? "−" : "";
  return `${sign}${Math.abs(rate).toFixed(2)}/100`;
}

export function RunValueCard({ rows }: { rows: PerPitchStats[] }) {
  const usable = rows.filter(
    (r): r is PerPitchStats & { rv_sum: number } => r.rv_sum != null,
  );
  if (usable.length === 0) {
    return (
      <StatCard title="Run value" help={RV_HELP}>
        <div className="text-[11px] text-white/55 italic">
          No run-value data for this filter.
        </div>
      </StatCard>
    );
  }

  // Sort most-saves (highest rv_sum) at the top.
  const sorted = [...usable].sort((a, b) => b.rv_sum - a.rv_sum);

  // Normalize bar length to the largest absolute total in the set so
  // the longest bar fills the row. Half the chart width is available
  // to each side (left for "allowed" / right for "saved").
  const maxAbs = Math.max(...sorted.map((r) => Math.abs(r.rv_sum)));
  const totalH = sorted.length * ROW_H + 28;
  const labelCol = 56; // left-edge text (pitch label + count)
  const valueCol = 96; // right-edge text (total + /100)
  const chartLeft = labelCol;
  const chartRight = W - valueCol;
  const zeroX = (chartLeft + chartRight) / 2;
  const halfChart = (chartRight - chartLeft) / 2;
  const net = sorted.reduce((acc, r) => acc + r.rv_sum, 0);

  return (
    <StatCard
      title="Run value"
      hint="allows ← 0 → saves"
      help={RV_HELP}
    >
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        width="100%"
        style={{ aspectRatio: `${W} / ${totalH}` }}
        className="block font-sans"
      >
        {/* Zero line */}
        <line
          x1={zeroX}
          y1={0}
          x2={zeroX}
          y2={totalH - 16}
          stroke="rgba(255,255,255,0.22)"
        />
        {sorted.map((r, i) => {
          const y = i * ROW_H + 4;
          const len =
            maxAbs > 0 ? (Math.abs(r.rv_sum) / maxAbs) * halfChart : 0;
          const barX = r.rv_sum >= 0 ? zeroX : zeroX - len;
          const fill = getPitchColor(r.pitch_type);
          const warn =
            r.rv_per_100 != null && r.rv_per_100 <= RV_PER_100_WARN;
          return (
            <g key={r.pitch_type}>
              {/* Label + count on the left */}
              <text
                x={4}
                y={y + (ROW_H - 8) / 2}
                fill="rgba(255,255,255,0.85)"
                fontSize={10}
                dominantBaseline="middle"
              >
                {getPitchLabel(r.pitch_type)}
              </text>
              <text
                x={labelCol - 4}
                y={y + (ROW_H - 8) / 2}
                fill="rgba(255,255,255,0.45)"
                fontSize={9}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {r.pitches}
              </text>
              {/* Diverging bar */}
              <rect
                x={barX}
                y={y}
                width={len}
                height={ROW_H - 8}
                fill={fill}
                fillOpacity={0.7}
                rx={2}
              />
              {/* Total + /100 on the right */}
              <text
                x={W - 4}
                y={y + (ROW_H - 8) / 2}
                fill="rgba(255,255,255,0.85)"
                fontSize={10}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatRv(r.rv_sum)} runs
              </text>
              {r.rv_per_100 != null ? (
                <text
                  x={W - 4}
                  y={y + (ROW_H - 8) / 2 + 9}
                  fill={
                    warn
                      ? "rgba(255,180,120,0.85)"
                      : "rgba(255,255,255,0.40)"
                  }
                  fontSize={8}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {formatRvPer100(r.rv_per_100)}
                  {warn ? " ⚠" : ""}
                </text>
              ) : null}
            </g>
          );
        })}
        {/* Net footer */}
        <text
          x={W - 4}
          y={totalH - 4}
          fill="rgba(255,255,255,0.75)"
          fontSize={10}
          textAnchor="end"
          dominantBaseline="middle"
        >
          Net: {formatRv(net)} runs
        </text>
      </svg>
    </StatCard>
  );
}
