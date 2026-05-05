"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Shape } from "three";

export function Stage() {
  return (
    <group>
      <StrikeZone />
      <HomePlate />
      <GroundFade />
      <StadiumSilhouette />
    </group>
  );
}

function StrikeZone() {
  // 17in plate (0.71 ft each side from center). Vertical bounds ~1.5ft to ~3.55ft.
  const w = 0.71;
  const top = 3.55;
  const bottom = 1.5;
  const z = 0.2;
  const corners: Array<[number, number, number]> = [
    [-w, bottom, z],
    [w, bottom, z],
    [w, top, z],
    [-w, top, z],
    [-w, bottom, z],
  ];
  return (
    <Line
      points={corners}
      color="#5b6878"
      lineWidth={1}
      transparent
      opacity={0.55}
    />
  );
}

function HomePlate() {
  const plateShape = useMemo(() => {
    const w = 0.71;
    const len = 0.71;
    const s = new Shape();
    s.moveTo(-w, len);
    s.lineTo(w, len);
    s.lineTo(w, 0);
    s.lineTo(0, -len);
    s.lineTo(-w, 0);
    s.closePath();
    return s;
  }, []);

  return (
    <mesh position={[0, 0.01, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[plateShape]} />
      <meshStandardMaterial color="#e8eaed" roughness={0.65} metalness={0.05} />
    </mesh>
  );
}

function GroundFade() {
  // Subtle dark gradient implying a ground plane without committing to grass or dirt.
  return (
    <mesh position={[0, 0, -30]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[140, 90]} />
      <meshBasicMaterial color="#0a0e14" transparent opacity={0.85} />
    </mesh>
  );
}

function StadiumSilhouette() {
  return (
    <mesh position={[0, 14, -95]}>
      <planeGeometry args={[220, 60]} />
      <meshBasicMaterial color="#141b26" />
    </mesh>
  );
}
