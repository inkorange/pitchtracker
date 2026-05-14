"use client";

import { useEffect, useMemo } from "react";
import { CatmullRomCurve3, DoubleSide, TubeGeometry, Vector3 } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { statcastToThree } from "@/lib/viz/coords";
import { type CompareSide, getPitchColor, getPitchColorForSide } from "@/lib/viz/colors";

// Fixed tubular resolution. drawProgress no longer changes the segment
// count — instead it animates how many of those segments are drawn,
// so the visible tube *length* grows from release to plate during
// playback rather than just appearing at full length all at once.
const TUBULAR_SEGMENTS = 96;
const RADIAL_SEGMENTS = 8;
// Each tubular segment contributes (radialSegments) quads × 6 indices
// per quad. TubeGeometry's index loop emits indices segment-by-segment
// in order, so setDrawRange(0, n * INDICES_PER_SEGMENT) cleanly draws
// the first n segments.
const INDICES_PER_SEGMENT = RADIAL_SEGMENTS * 6;

interface RibbonProps {
  path: Array<[number, number, number]>;
  pitchType: string;
  radius?: number;
  // 0 → no tube visible (ball is at release). 1 → full-length tube.
  // Intermediate values render only the first floor(N*progress)
  // segments, so the ribbon "grows" behind the ball as it flies.
  drawProgress?: number;
  // When set, picks the pitcher A vs B palette variant; otherwise uses
  // the default semantic color.
  side?: CompareSide;
  opacity?: number;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

export function Ribbon({
  path,
  pitchType,
  radius = 0.09,
  drawProgress = 1,
  side,
  opacity = 1,
  onPointerOver,
  onPointerOut,
  onClick,
}: RibbonProps) {
  // Build the geometry once at full resolution. drawProgress is NOT
  // a dependency — animating it through setDrawRange below is O(1)
  // and avoids reallocating BufferGeometry on every frame.
  const geometry = useMemo(() => {
    const points = path.map((p) => new Vector3(...statcastToThree(p)));
    const curve = new CatmullRomCurve3(points);
    return new TubeGeometry(
      curve,
      TUBULAR_SEGMENTS,
      radius,
      RADIAL_SEGMENTS,
      false,
    );
  }, [path, radius]);

  // Free the prior GPU buffers when path/radius changes or this ribbon
  // unmounts. Without this, every filter chip click would leak the old
  // TubeGeometry's vertex/index buffers — death by a thousand allocations
  // on mobile WebGL after a handful of filter toggles.
  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const visibleSegments = Math.max(
    0,
    Math.min(TUBULAR_SEGMENTS, Math.floor(TUBULAR_SEGMENTS * drawProgress)),
  );
  geometry.setDrawRange(0, visibleSegments * INDICES_PER_SEGMENT);

  const color = side ? getPitchColorForSide(pitchType, side) : getPitchColor(pitchType);

  // Material is always transparent so toggling opacity at runtime works
  // without needing material.needsUpdate. depthWrite is gated on near-
  // full opacity: opaque ribbons still occlude correctly, but a faded
  // ribbon (e.g. 10% in tunnel mode, or 18% when another pitch is
  // selected) MUST NOT write depth or it will block the tunnel cone /
  // other transparent layers behind it.
  const writeDepth = opacity >= 0.95;
  return (
    <mesh
      geometry={geometry}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.55}
        metalness={0.05}
        transparent
        opacity={opacity}
        depthWrite={writeDepth}
        // TubeGeometry leaves the start/end uncapped, so looking down
        // an open end would show through to the scene behind. Render
        // both sides so the inside of the far wall fills the opening
        // with the same color, making the tube read as enclosed.
        side={DoubleSide}
      />
    </mesh>
  );
}
