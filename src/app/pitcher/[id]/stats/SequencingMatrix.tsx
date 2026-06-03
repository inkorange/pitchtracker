"use client";

import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import type { SequencingMatrix as SequencingMatrixData } from "@/lib/pitch/sequencingMatrix";
import { StatCard } from "./StatCard";

// Pitch sequencing card. Two rows of analysis stacked in one card:
//
//   1. First-pitch distribution — unconditional P(first pitch type)
//      across all at-bats in the current selection. Shows what he
//      leads with.
//
//   2. Conditional transition matrix — for each pitch type just
//      thrown, the share of next-pitches by type. Each row sums to
//      ~100%. Answers "given a FF, what came next?".
//
// Data source: /api/pitcher/[id]/arsenal computes the matrix
// server-side from pitches scoped by season + hand + game ONLY —
// outcome and pitch_type filters are bypassed because removing
// mid-AB pitches would break the consecutive-pair counting that the
// matrix depends on. The hint text in the card header notes this.

interface SequencingMatrixProps {
  data: SequencingMatrixData | null;
}

export function SequencingMatrix({ data }: SequencingMatrixProps) {
  if (!data || data.pitchTypes.length === 0 || data.totalAtBats === 0) {
    return (
      <StatCard title="Sequencing">
        <div className="text-[11px] text-white/55 italic">
          Not enough data to build the sequencing matrix.
        </div>
      </StatCard>
    );
  }

  const { pitchTypes, transitions, transitionTotals, firstPitchCounts } = data;
  const firstPitchTotal = firstPitchCounts.reduce((s, n) => s + n, 0);

  // Column template for the matrix grid — pitch label column on the
  // left, then one column per pitch type, then a row-total column.
  // Tight tabular layout keeps the card narrow enough to share the
  // 2-col stats grid on lg+ without horizontal scroll.
  const cols = `1fr ${"minmax(48px, 1fr) ".repeat(pitchTypes.length)}auto`;

  return (
    <StatCard
      title="Sequencing"
      hint={`${data.totalAtBats} AB · ${data.totalTransitions} pair${
        data.totalTransitions === 1 ? "" : "s"
      }`}
    >
      <div className="space-y-4">
        {/* First-pitch distribution. Horizontal stacked bars per
            pitch type — each pitcher's first-pitch arsenal at a
            glance. */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
            First pitch
          </div>
          <ul className="space-y-1">
            {pitchTypes.map((type, idx) => {
              const count = firstPitchCounts[idx];
              if (count === 0) return null;
              const pct = firstPitchTotal > 0 ? (count / firstPitchTotal) * 100 : 0;
              return (
                <li
                  key={type}
                  className="grid grid-cols-[auto_1fr_auto] gap-2 items-center text-[11px] tabular-nums"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: getPitchColor(type) }}
                      aria-hidden
                    />
                    <span className="text-white/85">{getPitchLabel(type)}</span>
                  </span>
                  <span className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: getPitchColor(type),
                        opacity: 0.85,
                      }}
                    />
                  </span>
                  <span className="text-right text-white/85">
                    {pct.toFixed(0)}%
                    <span className="text-white/40 text-[10px] ml-1">
                      ({count})
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Transition matrix. Header row labels next-pitch types
            (columns); each body row is keyed on the previous pitch
            type. Cells colored by row-normalized share so the
            tendency reads at a glance. */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
            After this → next pitch
          </div>
          <div
            className="grid gap-y-1 text-[11px] tabular-nums"
            style={{ gridTemplateColumns: cols }}
          >
            {/* Header row. */}
            <div />
            {pitchTypes.map((type) => (
              <div
                key={`h-${type}`}
                className="text-center text-[10px] uppercase tracking-[0.1em] text-white/55"
                title={getPitchLabel(type)}
              >
                <span className="inline-flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: getPitchColor(type) }}
                    aria-hidden
                  />
                  {type}
                </span>
              </div>
            ))}
            <div className="text-right text-[10px] uppercase tracking-[0.1em] text-white/45 pl-2">
              n
            </div>

            {/* Body rows. */}
            {pitchTypes.map((rowType, rowIdx) => {
              const rowTotal = transitionTotals[rowIdx];
              const rowCounts = transitions[rowIdx];
              const rowMax = rowCounts.reduce((m, c) => Math.max(m, c), 0);
              return (
                <Row
                  key={rowType}
                  rowType={rowType}
                  rowTotal={rowTotal}
                  rowMax={rowMax}
                  rowCounts={rowCounts}
                  pitchTypes={pitchTypes}
                />
              );
            })}
          </div>
        </div>
      </div>
    </StatCard>
  );
}

function Row({
  rowType,
  rowTotal,
  rowMax,
  rowCounts,
  pitchTypes,
}: {
  rowType: string;
  rowTotal: number;
  rowMax: number;
  rowCounts: number[];
  pitchTypes: string[];
}) {
  return (
    <>
      {/* Row label — pitch color + short code. */}
      <div className="flex items-center gap-1.5 pr-1">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: getPitchColor(rowType) }}
          aria-hidden
        />
        <span className="text-white/85 truncate" title={getPitchLabel(rowType)}>
          {rowType}
        </span>
      </div>
      {pitchTypes.map((_, colIdx) => {
        const count = rowCounts[colIdx];
        if (rowTotal === 0 || count === 0) {
          // Empty cell — render the grid slot but no fill so the
          // matrix reads as "didn't do that" rather than "missing
          // data".
          return (
            <div
              key={colIdx}
              className="text-center text-white/25 px-1 py-0.5 rounded"
            >
              —
            </div>
          );
        }
        const share = count / rowTotal;
        return (
          <div
            key={colIdx}
            className="text-center px-1 py-0.5 rounded text-white/95"
            style={{ background: cellBg(share, rowMax / rowTotal) }}
            title={`${(share * 100).toFixed(1)}% · ${count} of ${rowTotal}`}
          >
            {Math.round(share * 100)}
            <span className="text-white/55 text-[9px]">%</span>
          </div>
        );
      })}
      <div className="text-right text-white/55 pl-2">{rowTotal}</div>
    </>
  );
}

// Yellow → red cell ramp, normalized to the row's max share so the
// busiest cell per row reads as fully red regardless of how
// concentrated the distribution is. Zero shares get transparent
// (handled in the caller before we reach here).
function cellBg(share: number, rowMaxShare: number): string {
  const t = rowMaxShare > 0 ? Math.min(1, share / rowMaxShare) : 0;
  const hue = 60 * (1 - t);
  const alpha = 0.18 + 0.55 * t;
  return `hsla(${hue}, 88%, 50%, ${alpha})`;
}
