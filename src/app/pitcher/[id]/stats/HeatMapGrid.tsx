"use client";

import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import type { StatPitch, PerPitchStats } from "./aggregations";
import { StatCard } from "./StatCard";

// Per-pitch-type strike-zone density: a small grid of mini zones,
// one per pitch type, with each cell darkened by how many pitches
// landed there. Cell color is the pitch's brand color (so the eye
// can scan the grid without reading labels), opacity scales with
// count.
//
// Statcast convention: plate_x, plate_z in feet, catcher's POV. The
// rulebook strike zone is ~17" wide (0.708 ft each side of center)
// and runs roughly 1.5–3.5 ft vertically. Show ±1.5 ft horizontal,
// 0–4.5 ft vertical so we capture the chase region around the zone.
const W = 110;
const H = 130;
const PADDING = 6;
const COLS = 5;
const ROWS = 7;
const X_RANGE: [number, number] = [-1.5, 1.5];
const Z_RANGE: [number, number] = [0.5, 4.2];

export function HeatMapGrid({
  pitches,
  perPitch,
}: {
  pitches: StatPitch[];
  perPitch: PerPitchStats[];
}) {
  // Bucket pitches into grid cells per pitch type.
  const byType = new Map<string, number[]>();
  for (const p of pitches) {
    if (!p.pitch_type || p.plate_x == null || p.plate_z == null) continue;
    const tx = (p.plate_x - X_RANGE[0]) / (X_RANGE[1] - X_RANGE[0]);
    const tz = (p.plate_z - Z_RANGE[0]) / (Z_RANGE[1] - Z_RANGE[0]);
    if (tx < 0 || tx > 1 || tz < 0 || tz > 1) continue;
    const col = Math.min(COLS - 1, Math.floor(tx * COLS));
    const row = Math.min(ROWS - 1, Math.floor(tz * ROWS));
    const idx = row * COLS + col;
    const grid = byType.get(p.pitch_type) ?? new Array(COLS * ROWS).fill(0);
    grid[idx] += 1;
    byType.set(p.pitch_type, grid);
  }

  const help = (
    <>
      <p>
        Plate-location density per pitch type, viewed from the
        catcher. One small heat map per pitch — hotter cells mean
        more pitches landed there.
      </p>
      <p>
        The black rectangle is the rule-book strike zone for an
        average batter. Concentrations off the corner edges are the
        pitcher&apos;s preferred chase spots; dense center-zone heat
        for a swing-and-miss pitch is a warning sign.
      </p>
    </>
  );

  if (byType.size === 0) {
    return (
      <StatCard title="Locations" help={help}>
        <div className="text-[11px] text-white/55 italic">
          No location data in the current filter.
        </div>
      </StatCard>
    );
  }

  // Order by usage (perPitch is already sorted that way).
  const ordered = perPitch.filter((r) => byType.has(r.pitch_type));
  const cellW = (W - PADDING * 2) / COLS;
  const cellH = (H - PADDING * 2) / ROWS;
  // Strike-zone box in plate coords → SVG.
  const sxMin = ((-0.708 - X_RANGE[0]) / (X_RANGE[1] - X_RANGE[0])) * (W - PADDING * 2) + PADDING;
  const sxMax = ((0.708 - X_RANGE[0]) / (X_RANGE[1] - X_RANGE[0])) * (W - PADDING * 2) + PADDING;
  // Y is flipped in SVG.
  const szMin = H - PADDING - ((1.5 - Z_RANGE[0]) / (Z_RANGE[1] - Z_RANGE[0])) * (H - PADDING * 2);
  const szMax = H - PADDING - ((3.5 - Z_RANGE[0]) / (Z_RANGE[1] - Z_RANGE[0])) * (H - PADDING * 2);

  return (
    <StatCard title="Locations" hint="catcher's POV" help={help}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ordered.map((r) => {
          const grid = byType.get(r.pitch_type)!;
          const peak = Math.max(...grid, 1);
          const color = getPitchColor(r.pitch_type);
          return (
            <div key={r.pitch_type} className="space-y-1">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-white/85 truncate">
                  {getPitchLabel(r.pitch_type)}
                </span>
                <span className="text-white/45 tabular-nums">
                  {grid.reduce((a, b) => a + b, 0)}
                </span>
              </div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                style={{ aspectRatio: `${W} / ${H}` }}
                className="block font-sans"
              >
                <rect width={W} height={H} fill="rgba(255,255,255,0.02)" rx={4} />
                {/* Cells */}
                {grid.map((count, i) => {
                  if (count === 0) return null;
                  const col = i % COLS;
                  const row = Math.floor(i / COLS);
                  const x = PADDING + col * cellW;
                  // SVG y is from top; row 0 is the top of zone (highest plate_z bucket).
                  const y = H - PADDING - (row + 1) * cellH;
                  const opacity = Math.min(0.95, 0.18 + 0.82 * (count / peak));
                  return (
                    <rect
                      key={i}
                      x={x}
                      y={y}
                      width={cellW - 0.5}
                      height={cellH - 0.5}
                      fill={color}
                      fillOpacity={opacity}
                    />
                  );
                })}
                {/* Strike zone outline */}
                <rect
                  x={sxMin}
                  y={szMax}
                  width={sxMax - sxMin}
                  height={szMin - szMax}
                  fill="none"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={1}
                />
              </svg>
            </div>
          );
        })}
      </div>
    </StatCard>
  );
}
