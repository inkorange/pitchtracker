"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Shape } from "three";

// Three.js coords: plate at (0, 0, 0), mound at z = -60.5,
// 1B at (+63.64, 0, -63.64), 2B at (0, 0, -127.28), 3B at (-63.64, 0, -63.64).

const PLATE_TO_MOUND = 60.5;
const BASE_DIST = 90;
const BASE_DIAG = BASE_DIST / Math.SQRT2; // 63.64 ft
const TWO_BASE = BASE_DIST * Math.SQRT2; // 127.28 ft

const FIRST_BASE: [number, number, number] = [BASE_DIAG, 0, -BASE_DIAG];
const SECOND_BASE: [number, number, number] = [0, 0, -TWO_BASE];
const THIRD_BASE: [number, number, number] = [-BASE_DIAG, 0, -BASE_DIAG];

const GRASS = "#2f5e35";
const DIRT = "#a87c52";
const LINE = "#f1f3f5";

// Tiny per-layer y offsets to avoid z-fighting on coplanar planes.
const Y_OUTFIELD = -0.02;
const Y_DIRT = 0.0;
const Y_INFIELD_GRASS = 0.005;
const Y_CUTOUT = 0.012;
const Y_BASE = 0.05;
const Y_PLATE = 0.06;
const Y_LINE = 0.07;

export function Stage() {
  return (
    <group>
      <Outfield />
      <InfieldDirt />
      <InfieldGrassDiamond />
      <PitchersMoundDirt />
      <HomePlateCutout />
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

// =====================================================================
// Outfield grass: a 180° fan from home, large enough to read as a field.
// Fan shape (vs a rectangle) gives the rounded outer edge in the reference.
// =====================================================================
function Outfield() {
  // 90° fair arc + 45° each foul side = 180°. Theta is measured in the
  // post-rotation frame: theta=0 points toward +x, increasing toward -z
  // (into the field). After the -π/2 x-rotation, the disc lies on xz.
  return (
    <mesh position={[0, Y_OUTFIELD, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[330, 96, 0, Math.PI]} />
      <meshStandardMaterial color={GRASS} roughness={0.95} metalness={0} />
    </mesh>
  );
}

// =====================================================================
// Infield dirt skin: 95 ft radius fan from home, 90° fair-ball arc.
// =====================================================================
function InfieldDirt() {
  return (
    <mesh position={[0, Y_DIRT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[95, 64, Math.PI / 4, Math.PI / 2]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

// =====================================================================
// Infield grass: classic diamond with corners at home, 1B, 2B, 3B.
// Drawn as a Shape (2D path) and then rotated onto xz.
// In Shape coords, x maps to Three x, y maps to -z. So Shape (0, 100)
// renders at Three (0, _, -100).
// =====================================================================
function InfieldGrassDiamond() {
  const shape = useMemo(() => {
    const s = new Shape();
    s.moveTo(0, 0); // home
    s.lineTo(BASE_DIAG, BASE_DIAG); // toward 1B
    s.lineTo(0, TWO_BASE); // toward 2B
    s.lineTo(-BASE_DIAG, BASE_DIAG); // toward 3B
    s.closePath();
    return s;
  }, []);
  return (
    <mesh position={[0, Y_INFIELD_GRASS, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={GRASS} roughness={0.95} metalness={0} />
    </mesh>
  );
}

// =====================================================================
// Home plate cutout: small dirt circle around home, covers the home
// corner of the grass diamond so the curved dirt edge appears.
// =====================================================================
function HomePlateCutout() {
  return (
    <mesh position={[0, Y_CUTOUT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[26, 48]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

function PitchersMoundDirt() {
  return (
    <mesh position={[0, Y_CUTOUT, -PLATE_TO_MOUND]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[10, 32]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

function Base({ position }: { position: [number, number, number] }) {
  // Bases are 15 inches square per MLB rules (1.25 ft). Add a tiny dirt
  // cutout under the base so it reads visually distinct from the grass.
  const size = 1.25;
  return (
    <group position={[position[0], 0, position[2]]}>
      <mesh position={[0, Y_CUTOUT - 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.5, 24]} />
        <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
      </mesh>
      <mesh position={[0, Y_BASE, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#f3f4f6" roughness={0.7} metalness={0.05} />
      </mesh>
    </group>
  );
}

function FoulLines() {
  // White lines from the back corner of home plate down each foul line
  // to roughly the warning track distance (320 ft along each line).
  const extent = 320;
  const firstLine: Array<[number, number, number]> = [
    [0, Y_LINE, 0],
    [extent / Math.SQRT2, Y_LINE, -extent / Math.SQRT2],
  ];
  const thirdLine: Array<[number, number, number]> = [
    [0, Y_LINE, 0],
    [-extent / Math.SQRT2, Y_LINE, -extent / Math.SQRT2],
  ];
  return (
    <>
      <Line points={firstLine} color={LINE} lineWidth={2} transparent opacity={0.9} />
      <Line points={thirdLine} color={LINE} lineWidth={2} transparent opacity={0.9} />
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
    <mesh position={[0, Y_PLATE, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[plateShape]} />
      <meshStandardMaterial color="#f3f4f6" roughness={0.65} metalness={0.05} />
    </mesh>
  );
}

function Mound() {
  // 18 ft diameter, ~1 ft tall (slight exaggeration of the regulation 10 inches).
  const height = 1.0;
  return (
    <group position={[0, 0, -PLATE_TO_MOUND]}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[2.2, 9, height, 48]} />
        <meshStandardMaterial color="#7d5638" roughness={0.95} metalness={0} />
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
    <mesh position={[0, 25, -380]}>
      <planeGeometry args={[800, 140]} />
      <meshBasicMaterial color="#0c1320" />
    </mesh>
  );
}
