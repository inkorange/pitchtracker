"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Path, Shape } from "three";

// Three.js coords: plate at (0, 0, 0), mound at z = -60.5,
// 1B at (+63.64, 0, -63.64), 2B at (0, 0, -127.28), 3B at (-63.64, 0, -63.64).
//
// Z-fighting fix: ONE dirt plane sits below ALL grass shapes. Where the
// grass shapes have geometry, the grass wins the depth test. Where they
// don't, the dirt is visible. The grass shapes (outfield with a hole at
// the dirt-fan area, plus the infield diamond with a mound hole) are
// drawn so they leave the right gaps for basepaths, home cutout, around
// the bases, and around the mound.

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

const Y_DIRT = -0.1; // single dirt plane sits below the grass
const Y_GRASS = 0.0;
const Y_BASE = 0.05;
const Y_PLATE = 0.06;
const Y_LINE = 0.07;

export function Stage() {
  return (
    <group>
      <Dirt />
      <OutfieldGrass />
      <InfieldGrassDiamond />
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
// Single dirt plane: a 95-ft fan from home (the infield-skin area).
// Sits 0.1 ft (~5 px on a typical top-down view) below the grass shapes.
// =====================================================================
function Dirt() {
  return (
    <mesh position={[0, Y_DIRT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[95, 96, Math.PI / 4, Math.PI / 2]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

// =====================================================================
// Outfield grass: 180° sector from home with a 95-ft pie-slice hole
// matching the dirt fan, so the dirt shows through the infield area.
// =====================================================================
function OutfieldGrass() {
  const shape = useMemo(() => {
    // Shape coord convention: x → world x, y → world -z (after the
    // -π/2 x-rotation). Field extends in +y in shape space.
    // Outer: 180° sector with apex at home. CCW winding.
    const s = new Shape();
    s.moveTo(330, 0);
    s.absarc(0, 0, 330, 0, Math.PI, false);
    s.lineTo(0, 0);
    s.closePath();

    // Hole: 95-ft 90° pie slice (the infield dirt fan), CW winding.
    const hole = new Path();
    const cosA = Math.cos(Math.PI / 4);
    const sinA = Math.sin(Math.PI / 4);
    hole.moveTo(0, 0);
    hole.lineTo(-95 * cosA, 95 * sinA); // toward 3B foul-line edge of fan
    hole.absarc(0, 0, 95, (3 * Math.PI) / 4, Math.PI / 4, true);
    hole.lineTo(95 * cosA, 95 * sinA);
    hole.lineTo(0, 0);
    s.holes.push(hole);

    return s;
  }, []);

  return (
    <mesh position={[0, Y_GRASS, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={GRASS} roughness={0.95} metalness={0} />
    </mesh>
  );
}

// =====================================================================
// Infield grass diamond: corners pulled slightly inside the bases so
// dirt shows around each base. Home corner pulled forward to 30 ft so
// the home-plate dirt cutout appears. Hole around the pitcher's mound.
// =====================================================================
function InfieldGrassDiamond() {
  const shape = useMemo(() => {
    // Diamond corners (10-ft inset along radial-from-home direction at 1B/3B,
    // 10-ft inset back from 2B, home corner at 30 ft for the home cutout).
    const inset = 10;
    const oneBaseRad = BASE_DIST - inset; // 80 ft
    const twoBaseRad = TWO_BASE - inset; // ~117.3 ft

    const s = new Shape();
    s.moveTo(0, 30); // home-side corner
    s.lineTo(oneBaseRad / Math.SQRT2, oneBaseRad / Math.SQRT2); // 1B side
    s.lineTo(0, twoBaseRad); // 2B side
    s.lineTo(-oneBaseRad / Math.SQRT2, oneBaseRad / Math.SQRT2); // 3B side
    s.closePath();

    // Mound dirt: 10-ft hole at (0, PLATE_TO_MOUND).
    const mound = new Path();
    mound.moveTo(10, PLATE_TO_MOUND);
    mound.absarc(0, PLATE_TO_MOUND, 10, 0, Math.PI * 2, true);
    s.holes.push(mound);

    return s;
  }, []);

  return (
    <mesh position={[0, Y_GRASS, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={GRASS} roughness={0.95} metalness={0} />
    </mesh>
  );
}

function Base({ position }: { position: [number, number, number] }) {
  const size = 1.25;
  return (
    <mesh position={[position[0], Y_BASE, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#f3f4f6" roughness={0.7} metalness={0.05} />
    </mesh>
  );
}

function FoulLines() {
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
  const height = 1.0;
  return (
    <group position={[0, 0, -PLATE_TO_MOUND]}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[2.2, 9, height, 48]} />
        <meshStandardMaterial color="#7d5638" roughness={0.95} metalness={0} />
      </mesh>
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
