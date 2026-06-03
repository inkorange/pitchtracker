"use client";

import { useEffect, useMemo } from "react";
import { CanvasTexture, DoubleSide, NearestFilter } from "three";
import { Html } from "@react-three/drei";
import { statcastToThree } from "@/lib/viz/coords";
import { type HeatGridSpec, HEAT_METRIC_LABELS } from "@/lib/pitch/heatGrid";

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

// Pixels per cell in the canvas texture. Higher = sharper edges
// (since we render NearestFilter), but the underlying data is still
// just cols × rows.
const TEXEL_PER_CELL = 64;

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
    // NearestFilter keeps cell edges crisp at any camera distance —
    // we want the grid to read as a 5×5 quilt, not a soft blur.
    tex.magFilter = NearestFilter;
    tex.minFilter = NearestFilter;
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
      <Html position={centerPlane} zIndexRange={[10, 0]} center>
        <div
          className="px-2 py-1 rounded bg-black/80 backdrop-blur-sm border border-white/15 text-[10px] tabular-nums whitespace-nowrap pointer-events-none shadow-lg text-white/90"
          style={{
            transform: `translate(0, ${(planeHeight / 2) * 24 + 18}px)`,
          }}
        >
          <span className="text-[#5fc7d8] font-semibold">
            {HEAT_METRIC_LABELS[grid.metric]}
          </span>
          <span className="text-white/55 ml-1.5">
            {grid.total} pitch{grid.total === 1 ? "" : "es"}
          </span>
        </div>
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
  for (const cell of grid.cells) {
    const x = cell.col * cellW;
    // Canvas Y is top-down; our row 0 is the bottom (low strike-zone
    // height), so flip when drawing.
    const y = (grid.rows - 1 - cell.row) * cellH;
    ctx.fillStyle = cellColor(cell.value);
    ctx.fillRect(x, y, cellW, cellH);
    // Cell border: faint to read as a "grid".
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
    // Strike-zone cells: thicker white outline so the zone is
    // visually distinguishable from the chase margin.
    if (cell.inZone) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);
    }
    // Value label — small, centered.
    if (Number.isFinite(cell.value) && cell.total > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.font = `${Math.round(cellH * 0.22)}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `${Math.round(cell.value * 100)}%`,
        x + cellW / 2,
        y + cellH * 0.42,
      );
      // Pitch count below.
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.font = `${Math.round(cellH * 0.16)}px ui-monospace, monospace`;
      ctx.fillText(`n=${cell.total}`, x + cellW / 2, y + cellH * 0.66);
    } else if (cell.total > 0) {
      // Total without ratio (e.g., "n=3" for cells lacking the
      // denominator).
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.font = `${Math.round(cellH * 0.16)}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`n=${cell.total}`, x + cellW / 2, y + cellH / 2);
    }
  }
}

// Color ramp: transparent at value=0, yellow at mid, red at high.
// NaN / no-data renders as transparent.
function cellColor(value: number): string {
  if (!Number.isFinite(value)) return "rgba(0, 0, 0, 0)";
  const t = Math.max(0, Math.min(1, value));
  // Hue from 60° (yellow) at 0 to 0° (red) at 1.
  const hue = 60 * (1 - t);
  const sat = 90;
  const lum = 50;
  const alpha = 0.25 + 0.55 * t;
  return `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;
}
