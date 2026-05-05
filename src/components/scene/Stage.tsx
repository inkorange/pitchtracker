"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Path, Shape } from "three";

// Three.js coords: plate at (0, 0, 0), mound at z = -60.5,
// 1B at (+63.64, 0, -63.64), 2B at (0, 0, -127.28), 3B at (-63.64, 0, -63.64).
//
// Field dimensions per the official diagram:
//   - Bases 90 ft apart
//   - Pitching rubber 60'6" (60.5 ft) from home
//   - Pitching mound 18 ft diameter (9 ft radius)
//   - Infield/outfield grass line: 95 ft radius from FRONT OF THE RUBBER
//     (not from home — common misconception)
//   - 13 ft arcs around bases
//   - Home plate area: 26 ft diameter circle
//
// Shape coord convention (after the -π/2 x-rotation that flattens shapes
// onto the field): shape's x → world x, shape's y → world -z.
// So in shape coords, the field extends in +y, with home at (0, 0),
// the rubber at (0, 60.5), and 2B at (0, 127.28).

const PLATE_TO_MOUND = 60.5;
const BASE_DIST = 90;
const BASE_DIAG = BASE_DIST / Math.SQRT2; // 63.64 ft
const TWO_BASE = BASE_DIST * Math.SQRT2; // 127.28 ft
const GRASS_LINE_R = 95; // radius from the front of the rubber

const FIRST_BASE: [number, number, number] = [BASE_DIAG, 0, -BASE_DIAG];
const SECOND_BASE: [number, number, number] = [0, 0, -TWO_BASE];
const THIRD_BASE: [number, number, number] = [-BASE_DIAG, 0, -BASE_DIAG];

const GRASS = "#2f5e35";
const DIRT = "#a87c52";
const LINE = "#f1f3f5";

const Y_DIRT = -0.1; // single dirt plane sits below the grass shapes
const Y_GRASS = 0.0;
const Y_BASE = 0.05;
const Y_PLATE = 0.06;
const Y_LINE = 0.07;

// Compute where the 95-ft-from-rubber arc intersects each foul line so
// we can use the same geometry for the dirt shape and the matching hole
// in the outfield grass.
const FOUL_HIT = (() => {
  // 1B foul line: (t/√2, t/√2) for t ≥ 0. Distance from rubber (0, 60.5):
  //   t² - 60.5·√2·t + 60.5² = 95²
  //   t² - 85.56·t - 5364.75 = 0
  const b = 60.5 * Math.SQRT2;
  const c = 60.5 * 60.5 - GRASS_LINE_R * GRASS_LINE_R;
  const t = (b + Math.sqrt(b * b - 4 * c)) / 2;
  const xy = t / Math.SQRT2;
  // Angle of the 1B-line intersection point measured from the rubber center.
  const ang = Math.atan2(xy - PLATE_TO_MOUND, xy);
  return { t, xy, ang };
})();

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
// Single dirt plane bounded by the foul lines and the 95-ft-from-rubber
// arc. Sits 0.1 ft below all grass shapes — z-fighting can't occur.
// =====================================================================
function dirtShape() {
  const s = new Shape();
  s.moveTo(0, 0); // home
  s.lineTo(FOUL_HIT.xy, FOUL_HIT.xy); // along 1B foul line to the arc
  // CCW arc through the outfield apex (passes through (0, 60.5 + 95)).
  s.absarc(0, PLATE_TO_MOUND, GRASS_LINE_R, FOUL_HIT.ang, Math.PI - FOUL_HIT.ang, false);
  s.lineTo(-FOUL_HIT.xy, FOUL_HIT.xy);
  s.lineTo(0, 0);
  return s;
}

function Dirt() {
  const shape = useMemo(() => dirtShape(), []);
  return (
    <mesh position={[0, Y_DIRT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

// =====================================================================
// Outfield grass: 180° sector with the dirt-shape carved out as a hole.
// =====================================================================
function OutfieldGrass() {
  const shape = useMemo(() => {
    const s = new Shape();
    s.moveTo(330, 0);
    s.absarc(0, 0, 330, 0, Math.PI, false);
    s.lineTo(0, 0);
    s.closePath();

    // Hole follows the dirt shape but with reversed winding (CW).
    const hole = new Path();
    hole.moveTo(0, 0);
    hole.lineTo(-FOUL_HIT.xy, FOUL_HIT.xy);
    hole.absarc(
      0,
      PLATE_TO_MOUND,
      GRASS_LINE_R,
      Math.PI - FOUL_HIT.ang,
      FOUL_HIT.ang,
      true,
    );
    hole.lineTo(FOUL_HIT.xy, FOUL_HIT.xy);
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
// Infield grass diamond: corners pulled 13 ft inside each base (matching
// the "13 ft arcs around bases" spec) so dirt buffers each base. Home
// corner pulled forward 26 ft for the home-plate dirt cutout (Home Plate
// Area is a 26-ft circle per spec). 9-ft hole at the mound (18 ft diameter).
// =====================================================================
function InfieldGrassDiamond() {
  const shape = useMemo(() => {
    const inset = 13;
    const oneBaseRad = BASE_DIST - inset; // 77 ft from home along the diagonal
    const twoBaseRad = TWO_BASE - inset; // 114.3 ft from home

    const s = new Shape();
    s.moveTo(0, 26); // home-side corner, 26 ft for the home plate area
    s.lineTo(oneBaseRad / Math.SQRT2, oneBaseRad / Math.SQRT2);
    s.lineTo(0, twoBaseRad);
    s.lineTo(-oneBaseRad / Math.SQRT2, oneBaseRad / Math.SQRT2);
    s.closePath();

    // 9-ft (18 ft diameter) hole at the mound.
    const mound = new Path();
    mound.moveTo(9, PLATE_TO_MOUND);
    mound.absarc(0, PLATE_TO_MOUND, 9, 0, Math.PI * 2, true);
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
  // 18 ft diameter (9 ft radius), ~10 inches tall (slightly exaggerated to 1 ft).
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
