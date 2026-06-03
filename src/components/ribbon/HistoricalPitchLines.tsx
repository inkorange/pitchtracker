"use client";

import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color } from "three";
import { getPitchColor } from "@/lib/viz/colors";
import { statcastToThree } from "@/lib/viz/coords";

// Renders the "historical" cohort of pitches as one merged
// LineSegments mesh — single draw call for every pitch outside the
// recent-ribbon window. Each pitch is a thin polyline through its
// trajectory samples (same path the Ribbon would consume), colored
// per pitch type.
//
// Why one merged mesh: at 2000+ historical pitches a per-pitch
// `<line>` would emit 2000 draw calls and roundtrip 2000 react
// reconciliation passes whenever the filter changes. Concatenating
// everything into one BufferGeometry collapses all of that into a
// single GPU submission — the actual cost moves from per-frame draw
// dispatch to a one-shot geometry build (when entries change).

interface HistoricalEntry {
  id: string;
  /** Trajectory sample points in raw Statcast coords. The component
   *  converts to three.js space; downstream callers reuse the same
   *  `path` they pass to the regular Ribbon. */
  path: Array<[number, number, number]>;
  pitchType: string;
}

interface HistoricalPitchLinesProps {
  entries: HistoricalEntry[];
  /** Bulk opacity for the cohort. Dim by default so recent ribbons
   *  read as foreground; the scene drops this further when an
   *  overlay (tunnel / heat grid) or selection takes over. */
  opacity: number;
}

export function HistoricalPitchLines({
  entries,
  opacity,
}: HistoricalPitchLinesProps) {
  const geometry = useMemo(() => buildGeometry(entries), [entries]);

  if (entries.length === 0) return null;

  return (
    <lineSegments geometry={geometry} renderOrder={-1}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </lineSegments>
  );
}

// Build a single BufferGeometry containing every entry's polyline
// as LineSegments pairs. For each path of K sample points we emit
// 2*(K-1) vertices: (p0,p1, p1,p2, p2,p3, …) — intermediate points
// duplicated so the GPU sees independent line segments. That's the
// only way to pack multiple distinct polylines into one
// LineSegments draw call.
function buildGeometry(entries: HistoricalEntry[]): BufferGeometry {
  let totalVertices = 0;
  for (const e of entries) {
    if (e.path.length >= 2) totalVertices += 2 * (e.path.length - 1);
  }
  const positions = new Float32Array(totalVertices * 3);
  const colors = new Float32Array(totalVertices * 3);

  // Cache parsed Color per pitch type so we're not building one
  // every loop iteration — that adds up at 2000+ pitches.
  const colorCache = new Map<string, Color>();
  const colorFor = (pitchType: string): Color => {
    let c = colorCache.get(pitchType);
    if (!c) {
      c = new Color(getPitchColor(pitchType));
      colorCache.set(pitchType, c);
    }
    return c;
  };

  let cursor = 0;
  for (const e of entries) {
    if (e.path.length < 2) continue;
    const c = colorFor(e.pitchType);
    for (let i = 0; i < e.path.length - 1; i++) {
      const a = statcastToThree(e.path[i]);
      const b = statcastToThree(e.path[i + 1]);
      writeVertex(positions, colors, cursor, a, c);
      cursor++;
      writeVertex(positions, colors, cursor, b, c);
      cursor++;
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setAttribute("color", new BufferAttribute(colors, 3));
  return geo;
}

function writeVertex(
  positions: Float32Array,
  colors: Float32Array,
  idx: number,
  [x, y, z]: [number, number, number],
  c: Color,
) {
  const base = idx * 3;
  positions[base + 0] = x;
  positions[base + 1] = y;
  positions[base + 2] = z;
  colors[base + 0] = c.r;
  colors[base + 1] = c.g;
  colors[base + 2] = c.b;
}
