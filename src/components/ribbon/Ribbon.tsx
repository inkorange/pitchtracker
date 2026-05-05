"use client";

import { useMemo } from "react";
import { CatmullRomCurve3, TubeGeometry, Vector3 } from "three";
import { statcastToThree } from "@/lib/viz/coords";
import { getPitchColor } from "@/lib/viz/colors";

interface RibbonProps {
  path: Array<[number, number, number]>;
  pitchType: string;
  radius?: number;
  emissiveIntensity?: number;
  drawProgress?: number;
}

export function Ribbon({
  path,
  pitchType,
  radius = 0.09,
  emissiveIntensity = 1.6,
  drawProgress = 1,
}: RibbonProps) {
  const geometry = useMemo(() => {
    const points = path.map((p) => new Vector3(...statcastToThree(p)));
    const curve = new CatmullRomCurve3(points);
    const visibleSamples = Math.max(8, Math.floor(points.length * 2 * drawProgress));
    return new TubeGeometry(curve, visibleSamples, radius, 12, false);
  }, [path, radius, drawProgress]);

  const color = getPitchColor(pitchType);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={emissiveIntensity}
        roughness={0.3}
        metalness={0.1}
        toneMapped={false}
      />
    </mesh>
  );
}
