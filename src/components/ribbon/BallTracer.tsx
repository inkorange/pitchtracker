"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { CatmullRomCurve3, Vector3, type Mesh } from "three";
import { statcastToThree } from "@/lib/viz/coords";

interface BallTracerProps {
  path: Array<[number, number, number]>;
  // 0 = at release, 1 = at plate. Owned by parent (the playback bar).
  progress: number;
}

export function BallTracer({ path, progress }: BallTracerProps) {
  const meshRef = useRef<Mesh>(null);
  const curve = useMemo(() => {
    const points = path.map((p) => new Vector3(...statcastToThree(p)));
    return new CatmullRomCurve3(points);
  }, [path]);

  useFrame(() => {
    if (!meshRef.current) return;
    const t = Math.max(0, Math.min(1, progress));
    const point = curve.getPoint(t);
    meshRef.current.position.copy(point);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.13, 16, 16]} />
      <meshStandardMaterial
        color="#ffffff"
        emissive="#ffffff"
        emissiveIntensity={1.4}
        toneMapped={false}
      />
    </mesh>
  );
}
