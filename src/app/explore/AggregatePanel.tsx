"use client";

import type { SearchAggregates } from "@/lib/savant/aggregates";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";

interface AggregatePanelProps {
  aggregates: SearchAggregates;
}

// Headline stats panel for the Aggregate tab. A grid of compact tiles
// for the headline numbers, then a pitch-type breakdown row showing
// each type's share of the result, color-coded with the same scheme
// used in the 3D scene so visualization-tab consistency is automatic.
export function AggregatePanel({ aggregates }: AggregatePanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg p-4 space-y-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/70">
          Aggregate stats
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Tile label="Pitches" value={fmtInt(aggregates.totalPitches)} />
          <Tile
            label="Avg velo"
            value={fmtVelo(aggregates.avgVelocity)}
            unit="mph"
          />
          <Tile
            label="Peak velo"
            value={fmtVelo(aggregates.peakVelocity)}
            unit="mph"
          />
          <Tile
            label="Avg horiz break"
            value={fmtBreak(aggregates.avgHorizontalBreak)}
            unit="in"
          />
          <Tile
            label="Avg ind. vert. break"
            value={fmtBreak(aggregates.avgInducedVerticalBreak)}
            unit="in"
          />
          <Tile
            label="Avg spin"
            value={fmtInt(aggregates.avgSpinRate)}
            unit="rpm"
          />
          <Tile label="Whiff rate" value={fmtRate(aggregates.whiffRate)} />
          <Tile label="In-zone rate" value={fmtRate(aggregates.inZoneRate)} />
        </div>
      </div>

      {aggregates.pitchTypes.length > 0 ? (
        <div className="rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/70">
            Pitch type breakdown
          </div>
          <ul className="space-y-2">
            {aggregates.pitchTypes.map((pt) => {
              const color = getPitchColor(pt.pitchType);
              return (
                <li key={pt.pitchType} className="flex items-center gap-3">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: color }}
                    aria-hidden
                  />
                  <span className="text-sm text-white/95 w-28 truncate">
                    {pt.pitchName ?? getPitchLabel(pt.pitchType)}
                  </span>
                  <span className="text-[11px] text-white/55 tabular-nums w-16">
                    {fmtInt(pt.count)}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(pt.share * 100).toFixed(1)}%`,
                        background: color,
                        opacity: 0.55,
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-white/85 tabular-nums w-12 text-right">
                    {(pt.share * 100).toFixed(1)}%
                  </span>
                  <span className="text-[11px] text-white/55 tabular-nums w-16 text-right hidden sm:inline">
                    {fmtVelo(pt.avgVelocity)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-md bg-white/[0.04] border border-white/10 p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/55">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-semibold tabular-nums text-white">
          {value}
        </span>
        {unit ? (
          <span className="text-[11px] text-white/55">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}

function fmtInt(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function fmtVelo(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function fmtBreak(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}`;
}

function fmtRate(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
