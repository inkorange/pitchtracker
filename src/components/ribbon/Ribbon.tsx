"use client";

import { useMemo } from "react";
import { CatmullRomCurve3, TubeGeometry, Vector3 } from "three";
import { statcastToThree } from "@/lib/viz/coords";
import { getPitchColor } from "@/lib/viz/colors";

interface RibbonProps {
  path: Array<[number, number, number]>;
  pitchType: string;
  radius?: number;
  drawProgress?: number;
}

export function Ribbon({
  path,
  pitchType,
  radius = 0.09,
  drawProgress = 1,
}: RibbonProps) {
  const geometry = useMemo(() => {
    const points = path.map((p) => new Vector3(...statcastToThree(p)));
    const curve = new CatmullRomCurve3(points);
    const visibleSamples = Math.max(8, Math.floor(points.length * 2 * drawProgress));
    return new TubeGeometry(curve, visibleSamples, radius, 8, false);
  }, [path, radius, drawProgress]);

  const color = getPitchColor(pitchType);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}
