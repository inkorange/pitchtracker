"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Shape } from "three";

// Three.js coords: plate at (0, 0, 0), mound at z = -60.5,
// 1B at (+63.64, 0, -63.64), 2B at (0, 0, -127.28), 3B at (-63.64, 0, -63.64).
//
// Field model: a single grass plane covers the whole field (the inner
// "infield grass" inside the 95-ft arc and the outfield grass outside it
// are now a continuous green surface). Discrete dirt features sit on top:
// - Home plate area (26 ft diameter / 13 ft radius circle at home)
// - Mound (18 ft diameter / 9 ft radius circle at the rubber)
// - 13 ft radius cutouts around each base
// - 6 ft wide basepath strips connecting consecutive bases, including
//   the home→1B and home→3B foul-line basepaths
//
// Dirt sits at y = 0.02, grass at y = 0. The 0.02 ft (~0.25") gap is
// large enough to win the depth test reliably and small enough to be
// visually invisible at any reasonable camera distance.

const PLATE_TO_MOUND = 60.5;
const BASE_DIST = 90;
const BASE_DIAG = BASE_DIST / Math.SQRT2; // 63.64 ft
const TWO_BASE = BASE_DIST * Math.SQRT2; // 127.28 ft
const HOME_AREA_R = 13; // 26 ft diameter
const MOUND_R = 9; // 18 ft diameter
const BASE_CUT_R = 13; // 13 ft arcs around each base
const BASEPATH_W = 6;

const FIRST_BASE: [number, number, number] = [BASE_DIAG, 0, -BASE_DIAG];
const SECOND_BASE: [number, number, number] = [0, 0, -TWO_BASE];
const THIRD_BASE: [number, number, number] = [-BASE_DIAG, 0, -BASE_DIAG];

const GRASS = "#2f5e35";
const DIRT = "#a87c52";
const LINE = "#f1f3f5";

const Y_GRASS = 0.0;
const Y_DIRT = 0.02;
const Y_BASE = 0.05;
const Y_PLATE = 0.06;
const Y_LINE = 0.07;

export function Stage() {
  return (
    <group>
      <Grass />
      <HomePlateArea />
      <MoundDirt />
      <BaseCutout position={FIRST_BASE} />
      <BaseCutout position={SECOND_BASE} />
      <BaseCutout position={THIRD_BASE} />
      <Basepath fromXY={[0, 0]} toXY={[BASE_DIAG, BASE_DIAG]} />
      <Basepath fromXY={[BASE_DIAG, BASE_DIAG]} toXY={[0, TWO_BASE]} />
      <Basepath fromXY={[0, TWO_BASE]} toXY={[-BASE_DIAG, BASE_DIAG]} />
      <Basepath fromXY={[-BASE_DIAG, BASE_DIAG]} toXY={[0, 0]} />
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
// One big grass plane covering the whole visible field. 180° sector
// from home, radius 330 ft. Outer arc gives the rounded outfield edge.
// =====================================================================
function Grass() {
  return (
    <mesh position={[0, Y_GRASS, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[330, 96, 0, Math.PI]} />
      <meshStandardMaterial color={GRASS} roughness={0.95} metalness={0} />
    </mesh>
  );
}

// =====================================================================
// Discrete dirt features that sit on top of the grass.
// =====================================================================

function HomePlateArea() {
  return (
    <mesh position={[0, Y_DIRT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[HOME_AREA_R, 48]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

function MoundDirt() {
  return (
    <mesh position={[0, Y_DIRT, -PLATE_TO_MOUND]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[MOUND_R, 32]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

function BaseCutout({ position }: { position: [number, number, number] }) {
  return (
    <mesh
      position={[position[0], Y_DIRT, position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <circleGeometry args={[BASE_CUT_R, 32]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

// Basepath strip: a rectangle from `fromXY` to `toXY` (in shape coords)
// with the given width, lying flat as dirt. Used both for foul-line
// basepaths (home↔1B, home↔3B) and middle basepaths (1B↔2B, 2B↔3B).
function Basepath({
  fromXY,
  toXY,
  width = BASEPATH_W,
}: {
  fromXY: [number, number];
  toXY: [number, number];
  width?: number;
}) {
  const shape = useMemo(() => {
    const dx = toXY[0] - fromXY[0];
    const dy = toXY[1] - fromXY[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    // Perpendicular CCW
    const px = (-uy * width) / 2;
    const py = (ux * width) / 2;
    const s = new Shape();
    s.moveTo(fromXY[0] - px, fromXY[1] - py);
    s.lineTo(toXY[0] - px, toXY[1] - py);
    s.lineTo(toXY[0] + px, toXY[1] + py);
    s.lineTo(fromXY[0] + px, fromXY[1] + py);
    s.closePath();
    return s;
  }, [fromXY, toXY, width]);

  return (
    <mesh position={[0, Y_DIRT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[shape]} />
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
