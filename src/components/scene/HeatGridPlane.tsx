"use client";

import { useEffect, useMemo } from "react";
import { CanvasTexture, DoubleSide, LinearFilter } from "three";
import { Html } from "@react-three/drei";
import { statcastToThree } from "@/lib/viz/coords";
import {
  HEAT_METRIC_EMPTY_HINTS,
  HEAT_METRIC_EVENT_LABELS,
  HEAT_METRIC_LABELS,
  heatMetricDenominator,
  type HeatCell,
  type HeatGridSpec,
  type HeatMetric,
} from "@/lib/pitch/heatGrid";

// Renders the heat grid as a textured plane positioned at the strike
// zone. The texture is drawn on a canvas every render with cell
// colors mapped from the active metric's value. A small floating
// label in the corner identifies which metric is showing and the
// pitch count behind it.
//
// Position: just behind the plate plane (statcast y=0.15 → three.js
// z=-0.15), so it sits between the plate and the strike zone
// wireframe (drawn at y=0.2). Pitch ribbons end at y=0 and pass
// through the plane visually; the half-transparent texture lets them
// stay readable while the heat overlay reads as the dominant signal.

interface HeatGridPlaneProps {
  grid: HeatGridSpec;
}

// Pixels per cell in the canvas texture. 256 keeps text + borders
// crisp under the user's zoom (was 64 with NearestFilter and showed
// visible chunkiness). Total texture: cols × rows × 256² ≈ 6 MP at
// the default 5×5 grid — acceptable GPU footprint for one texture.
const TEXEL_PER_CELL = 256;

export function HeatGridPlane({ grid }: HeatGridPlaneProps) {
  const { texture, w, h } = useMemo(() => {
    const w = grid.cols * TEXEL_PER_CELL;
    const h = grid.rows * TEXEL_PER_CELL;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    drawHeatGrid(ctx, grid, w, h);
    const tex = new CanvasTexture(c);
    // LinearFilter scales the canvas-rendered text + cell borders
    // smoothly as the camera zooms in/out. The 256 px/cell texture
    // resolution gives the linear sampler enough source pixels that
    // edges stay sharp at typical zoom levels.
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.needsUpdate = true;
    return { texture: tex, w, h };
  }, [grid]);

  // Free the GPU resources when the grid changes or the component
  // unmounts; CanvasTextures aren't auto-disposed by three.js.
  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  // Plane sizing: width = horizontal span (statcast x), height =
  // vertical span (statcast z). Position center at the grid bounds'
  // midpoint, y=0.15 statcast (just behind the plate in three.js).
  const planeWidth = grid.xMax - grid.xMin;
  const planeHeight = grid.zMax - grid.zMin;
  const centerX = (grid.xMin + grid.xMax) / 2;
  const centerZ = (grid.zMin + grid.zMax) / 2; // height in feet
  const centerPlane: [number, number, number] = statcastToThree([
    centerX,
    0.15,
    centerZ,
  ]);
  // Anchor the metric label at world-space TOP of the grid, slightly
  // floated above it so the chip sits cleanly clear of the topmost
  // cells regardless of camera angle.
  const labelAnchor: [number, number, number] = statcastToThree([
    centerX,
    0.15,
    grid.zMax + 0.35,
  ]);

  return (
    <group>
      <mesh position={centerPlane} renderOrder={4}>
        {/* +z axis aligns with the plane's "front"; statcastToThree
            puts the strike-zone vertical plane parallel to scene XY,
            so no rotation needed. */}
        <planeGeometry args={[planeWidth, planeHeight]} />
        <meshBasicMaterial
          map={texture}
          transparent
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Html position={labelAnchor} zIndexRange={[10, 0]} center>
        <HeatGridLabel grid={grid} />
      </Html>
      {/* (w, h) referenced so the texture sizing math participates in
          react-three-fiber's reconciliation. */}
      <group userData={{ w, h }} />
    </group>
  );
}

// Draws the heat grid into the canvas context: a colored cell per
// (col, row) cell with a thin black gridline between cells, plus a
// brighter outline marking the strike-zone cells.
function drawHeatGrid(
  ctx: CanvasRenderingContext2D,
  grid: HeatGridSpec,
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h);
  const cellW = w / grid.cols;
  const cellH = h / grid.rows;
  // Line widths scale with cell size so the grid + zone outlines
  // stay visible no matter what TEXEL_PER_CELL gets set to.
  const cellBorderW = Math.max(1, cellW * 0.025);
  const zoneOutlineW = Math.max(2, cellW * 0.045);
  // Density values are small in absolute terms (a cell with 4 of
  // 100 whiffs = 0.04) — auto-scale to the max cell value so the
  // hottest spot reads as fully red regardless of selection size.
  let maxValue = 0;
  for (const c of grid.cells) {
    if (Number.isFinite(c.value) && c.value > maxValue) maxValue = c.value;
  }
  const norm = maxValue > 0 ? 1 / maxValue : 1;
  for (const cell of grid.cells) {
    const x = cell.col * cellW;
    // Canvas Y is top-down; our row 0 is the bottom (low strike-zone
    // height), so flip when drawing.
    const y = (grid.rows - 1 - cell.row) * cellH;
    ctx.fillStyle = cellColor(cell.value, norm);
    ctx.fillRect(x, y, cellW, cellH);
    // Cell border: faint to read as a "grid".
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = cellBorderW;
    ctx.strokeRect(
      x + cellBorderW / 2,
      y + cellBorderW / 2,
      cellW - cellBorderW,
      cellH - cellBorderW,
    );
    // Strike-zone cells: thicker white outline so the zone is
    // visually distinguishable from the chase margin.
    if (cell.inZone) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = zoneOutlineW;
      ctx.strokeRect(
        x + zoneOutlineW / 2,
        y + zoneOutlineW / 2,
        cellW - zoneOutlineW,
        cellH - zoneOutlineW,
      );
    }
    // Event count for this cell driving the share-of-total value.
    const eventCount = cellEventCount(cell, grid.metric);
    if (Number.isFinite(cell.value) && eventCount > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.font = `${Math.round(cellH * 0.22)}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `${Math.round(cell.value * 100)}%`,
        x + cellW / 2,
        y + cellH * 0.42,
      );
      // Event count below (whiffs / chases / called / csw in this
      // cell — the numerator the percentage is a share of).
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.font = `${Math.round(cellH * 0.16)}px ui-monospace, monospace`;
      ctx.fillText(`n=${eventCount}`, x + cellW / 2, y + cellH * 0.66);
    }
  }
}

function cellEventCount(c: HeatCell, metric: HeatMetric): number {
  switch (metric) {
    case "whiff":
      return c.whiffs;
    case "chase":
      return c.chaseSwings;
    case "called":
      return c.called;
    case "csw":
      return c.called + c.whiffs;
  }
}

// Floating chip above the grid. When the active metric's
// denominator is zero (e.g., user selected only "ball" outcomes and
// the active metric is whiff %), shows an actionable hint instead
// of the metric name + pitch count so the blank grid isn't
// mysterious.
function HeatGridLabel({ grid }: { grid: HeatGridSpec }) {
  const denominator = heatMetricDenominator(grid);
  const hasData = denominator > 0;
  const [singular, plural] = HEAT_METRIC_EVENT_LABELS[grid.metric];
  const eventLabel = denominator === 1 ? singular : plural;
  return (
    <div
      className={`px-2 py-1 rounded bg-black/80 backdrop-blur-sm border text-[10px] tabular-nums whitespace-nowrap pointer-events-none shadow-lg ${
        hasData ? "border-white/15 text-white/90" : "border-amber-300/35"
      }`}
    >
      {hasData ? (
        <>
          <span className="text-[#5fc7d8] font-semibold">
            {HEAT_METRIC_LABELS[grid.metric]}
          </span>
          <span className="text-white/55 ml-1.5">
            {denominator} {eventLabel}
          </span>
        </>
      ) : (
        <span className="text-amber-300/90">
          {HEAT_METRIC_EMPTY_HINTS[grid.metric]}
        </span>
      )}
    </div>
  );
}

// Color ramp: fully transparent for cells with no events (value 0
// or NaN), then yellow → red as value rises. The `norm` factor
// scales the raw density (typically small — a 5% cell is a hot
// spot in a flat 20-cell distribution) so the hottest cell reads
// as fully red regardless of selection size.
function cellColor(value: number, norm: number): string {
  if (!Number.isFinite(value) || value <= 0) return "rgba(0, 0, 0, 0)";
  const t = Math.max(0, Math.min(1, value * norm));
  // Hue from 60° (yellow) at low to 0° (red) at high.
  const hue = 60 * (1 - t);
  const sat = 90;
  const lum = 50;
  const alpha = 0.25 + 0.55 * t;
  return `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;
}
