"use client";

import { useMemo } from "react";
import { CatmullRomCurve3, TubeGeometry, Vector3 } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { statcastToThree } from "@/lib/viz/coords";
import { type CompareSide, getPitchColor, getPitchColorForSide } from "@/lib/viz/colors";

interface RibbonProps {
  path: Array<[number, number, number]>;
  pitchType: string;
  radius?: number;
  drawProgress?: number;
  // When set, picks the pitcher A vs B palette variant; otherwise uses
  // the default semantic color.
  side?: CompareSide;
  opacity?: number;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
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
}: RibbonProps) {
  const geometry = useMemo(() => {
    const points = path.map((p) => new Vector3(...statcastToThree(p)));
    const curve = new CatmullRomCurve3(points);
    const visibleSamples = Math.max(8, Math.floor(points.length * 2 * drawProgress));
    return new TubeGeometry(curve, visibleSamples, radius, 8, false);
  }, [path, radius, drawProgress]);

  const color = side ? getPitchColorForSide(pitchType, side) : getPitchColor(pitchType);
  const transparent = opacity < 1;

  return (
    <mesh geometry={geometry} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <meshStandardMaterial
        color={color}
        roughness={0.55}
        metalness={0.05}
        transparent={transparent}
        opacity={opacity}
        depthWrite={!transparent}
      />
    </mesh>
  );
}
