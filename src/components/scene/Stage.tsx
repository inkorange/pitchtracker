"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Path, Shape } from "three";

// Three.js coords: plate at (0, 0, 0), mound at z = -60.5,
// 1B at (+63.64, 0, -63.64), 2B at (0, 0, -127.28), 3B at (-63.64, 0, -63.64).
//
// Field model (matches the reference photo):
// - One big grass plane covers the whole field as the base layer.
// - A curved dirt fan extends 120 ft from home in fair territory — the
//   "infield skin", with foul lines as straight edges and a 90° arc
//   connecting them through the outfield direction.
// - Inside the dirt fan, an infield grass diamond carves out the center,
//   with corners pulled 13 ft inside each base. The dirt that remains
//   visible between the diamond and the fan boundary IS the basepath
//   network (foul-line strips + 1B-2B + 2B-3B + base cutouts), all
//   natural consequences of this geometry.
// - The mound and home-plate area sit as additional dirt features.

const PLATE_TO_MOUND = 60.5;
const BASE_DIST = 90;
const BASE_DIAG = BASE_DIST / Math.SQRT2; // 63.64 ft
const TWO_BASE = BASE_DIST * Math.SQRT2; // 127.28 ft
const DIRT_FAN_R = 120; // distance from home to the outfield-grass arc
const HOME_AREA_R = 13; // 26 ft diameter
const MOUND_R = 9; // 18 ft diameter
const BASE_INSET = 13; // 13 ft inside each base, so dirt buffer = 13 ft

const FIRST_BASE: [number, number, number] = [BASE_DIAG, 0, -BASE_DIAG];
const SECOND_BASE: [number, number, number] = [0, 0, -TWO_BASE];
const THIRD_BASE: [number, number, number] = [-BASE_DIAG, 0, -BASE_DIAG];

const GRASS = "#2f5e35";
const DIRT = "#a87c52";
const LINE = "#f1f3f5";

// Y stack — layered with enough separation that depth buffering is
// reliable from any reasonable camera distance.
const Y_GRASS_BASE = 0.0;
const Y_DIRT_FAN = 0.05;
const Y_INFIELD_GRASS = 0.1;
const Y_DIRT_FEATURE = 0.15; // home plate area, mound dirt, etc.
const Y_BASE = 0.2;
const Y_PLATE = 0.21;
const Y_LINE = 0.22;

export function Stage() {
  return (
    <group>
      <OutfieldGrass />
      <InfieldDirtFan />
      <InfieldGrassDiamond />
      <HomePlateArea />
      <MoundDirt />
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
// Base layer: 180° green sector covering the whole field. Outer arc
// gives the rounded outfield-grass edge.
// =====================================================================
function OutfieldGrass() {
  return (
    <mesh position={[0, Y_GRASS_BASE, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[330, 96, 0, Math.PI]} />
      <meshStandardMaterial color={GRASS} roughness={0.95} metalness={0} />
    </mesh>
  );
}

// =====================================================================
// Infield dirt: 120-ft fan from home, 90° fair-ball arc. Sits on top
// of the outfield grass.
// =====================================================================
function InfieldDirtFan() {
  return (
    <mesh position={[0, Y_DIRT_FAN, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[DIRT_FAN_R, 96, Math.PI / 4, Math.PI / 2]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

// =====================================================================
// Infield grass diamond: corners 13 ft inside each base; home corner
// at the home-plate-area boundary; mound hole.
// The dirt that shows BETWEEN this diamond and the dirt-fan boundary is
// the basepath network — foul-line strips, 1B-2B, 2B-3B, and the base
// cutouts. No separate strips needed.
// =====================================================================
function InfieldGrassDiamond() {
  const shape = useMemo(() => {
    const oneBaseRad = BASE_DIST - BASE_INSET; // 77 ft from home along the diagonal
    const twoBaseRad = TWO_BASE - BASE_INSET; // 114.3 ft from home

    const s = new Shape();
    // Home corner pulled to 26 ft (matches the home-plate-area diameter)
    // so the home-side dirt buffer reads as a clean strip, not a
    // sharp diamond point butting up against the home plate circle.
    s.moveTo(0, 26);
    s.lineTo(oneBaseRad / Math.SQRT2, oneBaseRad / Math.SQRT2);
    s.lineTo(0, twoBaseRad);
    s.lineTo(-oneBaseRad / Math.SQRT2, oneBaseRad / Math.SQRT2);
    s.closePath();

    // Mound hole (CW for hole winding).
    const mound = new Path();
    mound.moveTo(MOUND_R, PLATE_TO_MOUND);
    mound.absarc(0, PLATE_TO_MOUND, MOUND_R, 0, Math.PI * 2, true);
    s.holes.push(mound);

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
// Discrete dirt features that sit above the infield grass diamond.
// =====================================================================

function HomePlateArea() {
  return (
    <mesh position={[0, Y_DIRT_FEATURE, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[HOME_AREA_R, 48]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

function MoundDirt() {
  return (
    <mesh
      position={[0, Y_DIRT_FEATURE, -PLATE_TO_MOUND]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <circleGeometry args={[MOUND_R, 32]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

function Base({ position }: { position: [number, number, number] }) {
  const size = 1.25;
  return (
    <mesh
      position={[position[0], Y_BASE, position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
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
