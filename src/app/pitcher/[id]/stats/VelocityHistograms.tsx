"use client";

import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import type { StatPitch, PerPitchStats } from "./aggregations";
import { StatCard } from "./StatCard";

// Small-multiples velocity histograms — one mini chart per pitch
// type, sorted by usage. Shows distribution shape (consistency,
// tails) at a glance. Rare pitches with <5 samples are skipped.
const HIST_W = 140;
const HIST_H = 60;
const BIN_WIDTH_MPH = 0.5;

export function VelocityHistograms({
  pitches,
  perPitch,
}: {
  pitches: StatPitch[];
  perPitch: PerPitchStats[];
}) {
  // Bucket velocities per pitch type at half-mph bins.
  const byType = new Map<string, number[]>();
  for (const p of pitches) {
    if (!p.pitch_type || p.release_speed == null) continue;
    const arr = byType.get(p.pitch_type) ?? [];
    arr.push(p.release_speed);
    byType.set(p.pitch_type, arr);
  }
  const ordered = perPitch.filter((r) => (byType.get(r.pitch_type)?.length ?? 0) >= 5);

  const help = (
    <>
      <p>
        Velocity distribution per pitch type — one mini histogram per
        pitch he throws. Bars are pitch counts in 1 mph buckets.
      </p>
      <p>
        Read it as <strong>shape</strong>: a tight bell = consistent
        velocity; a wide spread = noisier release; a long high-end
        tail = he flashed something extra a handful of times.
      </p>
      <p>
        All histograms share an x-axis range so two pitches&apos;
        clouds can be compared directly without rescaling.
      </p>
    </>
  );

  if (ordered.length === 0) {
    return (
      <StatCard title="Velocity" help={help}>
        <div className="text-[11px] text-white/55 italic">
          Not enough velocity samples to plot.
        </div>
      </StatCard>
    );
  }

  // Use a shared mph range across mini charts so the eye compares
  // distributions without rescaling.
  const all = pitches.map((p) => p.release_speed).filter((v): v is number => v != null);
  const minMph = Math.floor(Math.min(...all) - 1);
  const maxMph = Math.ceil(Math.max(...all) + 1);
  const binCount = Math.ceil((maxMph - minMph) / BIN_WIDTH_MPH);

  return (
    <StatCard title="Velocity" help={help}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ordered.map((r) => {
          const samples = byType.get(r.pitch_type) ?? [];
          const bins = new Array(binCount).fill(0);
          for (const v of samples) {
            const idx = Math.min(
              binCount - 1,
              Math.max(0, Math.floor((v - minMph) / BIN_WIDTH_MPH)),
            );
            bins[idx] += 1;
          }
          const peak = Math.max(...bins, 1);
          const color = getPitchColor(r.pitch_type);
          return (
            <div key={r.pitch_type} className="space-y-1">
              <div className="flex items-baseline justify-between text-[10px]">
                <span className="text-white/85 truncate">
                  {getPitchLabel(r.pitch_type)}
                </span>
                <span className="text-white/55 tabular-nums">
                  {r.velo_mean != null ? `${r.velo_mean.toFixed(1)} mph` : "—"}
                </span>
              </div>
              <svg
                viewBox={`0 0 ${HIST_W} ${HIST_H}`}
                width="100%"
                style={{ aspectRatio: `${HIST_W} / ${HIST_H}` }}
                className="block font-sans"
              >
                <rect width={HIST_W} height={HIST_H} fill="rgba(255,255,255,0.03)" rx={4} />
                {bins.map((count, i) => {
                  if (count === 0) return null;
                  const x = (i / binCount) * HIST_W;
                  const w = HIST_W / binCount - 0.5;
                  const h = (count / peak) * (HIST_H - 8);
                  return (
                    <rect
                      key={i}
                      x={x}
                      y={HIST_H - h}
                      width={w}
                      height={h}
                      fill={color}
                      fillOpacity={0.7}
                    />
                  );
                })}
                {/* Mean tick mark */}
                {r.velo_mean != null ? (
                  <line
                    x1={((r.velo_mean - minMph) / (maxMph - minMph)) * HIST_W}
                    y1={0}
                    x2={((r.velo_mean - minMph) / (maxMph - minMph)) * HIST_W}
                    y2={HIST_H}
                    stroke={color}
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                ) : null}
              </svg>
              <div className="flex justify-between text-[9px] text-white/35 tabular-nums">
                <span>{minMph}</span>
                <span>{maxMph}</span>
              </div>
            </div>
          );
        })}
      </div>
    </StatCard>
  );
}
