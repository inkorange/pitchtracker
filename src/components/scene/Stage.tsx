"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Shape } from "three";

export function Stage() {
  return (
    <group>
      <StrikeZone />
      <HomePlate />
      <Mound />
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

function Mound() {
  // MLB rules: 18 ft diameter (9 ft radius), 10" tall (0.83 ft) with a flat
  // plateau at top where the rubber sits. The front edge of the mound is
  // 60'6" - 9' = 51.5 ft from the plate; mound center at y = 60.5 ft (Statcast),
  // which is z = -60.5 in Three.js coords. We use a low frustum (radiusTop <
  // radiusBottom) for the slope, slightly exaggerated in height for visibility.
  const height = 1.0;
  return (
    <group position={[0, 0, -60.5]}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[2.2, 9, height, 48]} />
        <meshStandardMaterial color="#3a2a20" roughness={0.95} metalness={0} />
      </mesh>
      {/* Pitcher's rubber: 24"x6" white slab on the plateau */}
      <mesh position={[0, height + 0.04, 0.4]}>
        <boxGeometry args={[2, 0.08, 0.5]} />
        <meshStandardMaterial color="#dadde2" roughness={0.7} metalness={0.05} />
      </mesh>
    </group>
  );
}

function GroundFade() {
  // Subtle dark gradient implying a ground plane without committing to grass or dirt.
  return (
    <mesh position={[0, 0, -60]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[300, 220]} />
      <meshBasicMaterial color="#0a0e14" transparent opacity={0.85} />
    </mesh>
  );
}

function StadiumSilhouette() {
  // Far enough back that it reads as a horizon backdrop, not a wall behind
  // the mound. Camera far-clip in Scene.tsx is set to 1500 to accommodate.
  return (
    <mesh position={[0, 25, -320]}>
      <planeGeometry args={[600, 140]} />
      <meshBasicMaterial color="#101620" />
    </mesh>
  );
}
