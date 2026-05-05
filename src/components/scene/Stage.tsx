"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Shape } from "three";

// Three.js coords in this scene: plate at (0, 0, 0), mound at z = -60.5,
// 1B at (+63.64, 0, -63.64), 2B at (0, 0, -127.28), 3B at (-63.64, 0, -63.64).
// The CircleGeometry math below is rotated from the default xy plane onto
// the xz plane so it lies flat as a ground surface.

const PLATE_TO_MOUND = 60.5;
const BASE_DIST = 90;
const BASE_DIAG = BASE_DIST / Math.SQRT2; // 63.64 ft

const FIRST_BASE: [number, number, number] = [BASE_DIAG, 0, -BASE_DIAG];
const SECOND_BASE: [number, number, number] = [0, 0, -BASE_DIST * Math.SQRT2];
const THIRD_BASE: [number, number, number] = [-BASE_DIAG, 0, -BASE_DIAG];

// Authentic but slightly muted greens / browns. Real fields are
// surprisingly bright on TV, but in a dark UI a more saturated green
// would feel cartoonish. Tuned for legibility against the ribbons.
const GRASS = "#2f5e35";
const DIRT = "#7a543a";
const LINE = "#e6e8eb";

export function Stage() {
  return (
    <group>
      <Grass />
      <InfieldDirt />
      <InfieldGrass />
      <PitchersMoundDirt />
      <FoulLines />
      <Base position={FIRST_BASE} />
      <Base position={SECOND_BASE} />
      <Base position={THIRD_BASE} />
      <HomePlate />
      <Mound />
      <StrikeZone />
      <StadiumSilhouette />
    </group>
  );
}

function Grass() {
  // Big plane covering the visible field area. Slightly lower than the dirt
  // (y = -0.005) to avoid z-fighting with the dirt cutouts above it.
  return (
    <mesh position={[0, -0.01, -120]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[500, 360]} />
      <meshStandardMaterial color={GRASS} roughness={0.95} metalness={0} />
    </mesh>
  );
}

function InfieldDirt() {
  // 95 ft radius fan from home plate, covering the 90° fair-ball arc.
  // CircleGeometry default is in xy with theta starting at +x going CCW.
  // We rotate -90° around x so the disc lies in xz, and we orient the arc
  // to span from the third-base line (x<0, z<0) to the first-base line
  // (x>0, z<0). After the -π/2 x-rotation, theta=0 points to +x and
  // increases toward +z (which after the rotation is "down into the field").
  // We want from -45° to +45° measured from the negative-z axis, which in
  // post-rotation theta is from π/4 to 3π/4.
  return (
    <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[95, 64, Math.PI / 4, Math.PI / 2]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

function InfieldGrass() {
  // The classic infield-grass cutout — a smaller fan of grass inside the
  // dirt skin, leaving dirt only around the bases and basepaths.
  // 60 ft radius covers the typical infield-grass area; keeps dirt
  // visible as a 35 ft "skin" between this and the edge of the dirt fan.
  // Sit slightly above the dirt so it shows.
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[60, 64, Math.PI / 4, Math.PI / 2]} />
      <meshStandardMaterial color={GRASS} roughness={0.95} metalness={0} />
    </mesh>
  );
}

function PitchersMoundDirt() {
  // Round dirt patch under the mound itself.
  return (
    <mesh position={[0, 0.03, -PLATE_TO_MOUND]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[10, 32]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

function Base({ position }: { position: [number, number, number] }) {
  // Bases are 15 inches square per MLB rules (1.25 ft).
  const size = 1.25;
  return (
    <mesh position={[position[0], 0.04, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#f3f4f6" roughness={0.7} metalness={0.05} />
    </mesh>
  );
}

function FoulLines() {
  // Thin white lines down the first- and third-base foul lines.
  // Extend them to the edge of the visible field for a clean read.
  const extent = 250;
  const firstLine: Array<[number, number, number]> = [
    [0, 0.05, 0],
    [extent / Math.SQRT2, 0.05, -extent / Math.SQRT2],
  ];
  const thirdLine: Array<[number, number, number]> = [
    [0, 0.05, 0],
    [-extent / Math.SQRT2, 0.05, -extent / Math.SQRT2],
  ];
  return (
    <>
      <Line points={firstLine} color={LINE} lineWidth={1.5} transparent opacity={0.85} />
      <Line points={thirdLine} color={LINE} lineWidth={1.5} transparent opacity={0.85} />
    </>
  );
}

function StrikeZone() {
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
      color="#cdd5e0"
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
    <mesh position={[0, 0.05, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[plateShape]} />
      <meshStandardMaterial color="#f3f4f6" roughness={0.65} metalness={0.05} />
    </mesh>
  );
}

function Mound() {
  // 18 ft diameter, slope down from a 4 ft plateau, ~1 ft tall (slightly
  // exaggerated from the regulation 10 inches for visibility).
  const height = 1.0;
  return (
    <group position={[0, 0, -PLATE_TO_MOUND]}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[2.2, 9, height, 48]} />
        <meshStandardMaterial color="#5a3e2c" roughness={0.95} metalness={0} />
      </mesh>
      {/* Pitcher's rubber: 24"x6" white slab on the plateau */}
      <mesh position={[0, height + 0.04, 0.4]}>
        <boxGeometry args={[2, 0.08, 0.5]} />
        <meshStandardMaterial color="#f3f4f6" roughness={0.7} metalness={0.05} />
      </mesh>
    </group>
  );
}

function StadiumSilhouette() {
  return (
    <mesh position={[0, 25, -360]}>
      <planeGeometry args={[700, 140]} />
      <meshBasicMaterial color="#0f1722" />
    </mesh>
  );
}
