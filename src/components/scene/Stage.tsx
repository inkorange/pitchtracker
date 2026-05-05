"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Path, Shape } from "three";

// Three.js coords: plate at (0, 0, 0), mound at z = -60.5,
// 1B at (+63.64, 0, -63.64), 2B at (0, 0, -127.28), 3B at (-63.64, 0, -63.64).
//
// Field model (matches the reference photo + official MLB diagram):
//
// Layers stacked low → high in y:
//  1. Outfield grass (180° sector covering the whole field)
//  2. Infield dirt fan — bounded by foul lines from home and the 95-ft
//     arc from the FRONT OF THE RUBBER (official spec). That arc passes
//     ~127 ft from home along each foul line and ~155 ft from home
//     through the outfield, well past 2B at 127.28 ft.
//  3. Infield grass diamond with corners at the actual base positions
//     (1B, 2B, 3B) and a home corner pulled to 26 ft. Mound is a hole.
//  4. Dirt features above the grass diamond — 13 ft circles at each
//     base (creating the rounded-concave corner look on the grass),
//     home plate area, and the mound dirt patch.

const PLATE_TO_MOUND = 60.5;
const BASE_DIST = 90;
const BASE_DIAG = BASE_DIST / Math.SQRT2; // 63.64 ft
const TWO_BASE = BASE_DIST * Math.SQRT2; // 127.28 ft
const GRASS_LINE_R = 95; // 95 ft radius from front of the rubber
const HOME_AREA_R = 13; // 26 ft diameter
const MOUND_R = 9; // 18 ft diameter
const BASE_CUT_R = 13; // 13 ft arcs around each base

const FIRST_BASE: [number, number, number] = [BASE_DIAG, 0, -BASE_DIAG];
const SECOND_BASE: [number, number, number] = [0, 0, -TWO_BASE];
const THIRD_BASE: [number, number, number] = [-BASE_DIAG, 0, -BASE_DIAG];

const GRASS = "#2f5e35";
const DIRT = "#a87c52";
const LINE = "#f1f3f5";

const Y_GRASS_BASE = 0.0;
const Y_DIRT_FAN = 0.05;
const Y_INFIELD_GRASS = 0.1;
const Y_DIRT_FEATURE = 0.15;
const Y_BASE = 0.2;
const Y_PLATE = 0.21;
const Y_LINE = 0.22;

// Compute where the 95-ft-from-rubber arc intersects each foul line.
const FOUL_HIT = (() => {
  const b = PLATE_TO_MOUND * Math.SQRT2;
  const c = PLATE_TO_MOUND * PLATE_TO_MOUND - GRASS_LINE_R * GRASS_LINE_R;
  const t = (b + Math.sqrt(b * b - 4 * c)) / 2;
  const xy = t / Math.SQRT2;
  // Angle of the 1B-line intersection point measured from the rubber center.
  const ang = Math.atan2(xy - PLATE_TO_MOUND, xy);
  return { xy, ang };
})();

export function Stage() {
  return (
    <group>
      <OutfieldGrass />
      <InfieldDirtFan />
      <InfieldGrassDiamond />
      <FoulLineBasepath side="first" />
      <FoulLineBasepath side="third" />
      <BaseCutout position={FIRST_BASE} />
      <BaseCutout position={SECOND_BASE} />
      <BaseCutout position={THIRD_BASE} />
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
// Outfield grass: a large square plane centered slightly forward of
// home so it covers the field plus generous margins to the sides and
// behind the plate. No more black void around the field.
// =====================================================================
function OutfieldGrass() {
  return (
    <mesh
      position={[0, Y_GRASS_BASE, -100]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[800, 800]} />
      <meshStandardMaterial color={GRASS} roughness={0.95} metalness={0} />
    </mesh>
  );
}

// =====================================================================
// Infield dirt fan: bounded by foul lines from home and the 95-ft arc
// from the front of the rubber. Includes the area past 2B where the
// dirt curves through the outfield.
// =====================================================================
function InfieldDirtFan() {
  const shape = useMemo(() => {
    const s = new Shape();
    s.moveTo(0, 0); // home
    s.lineTo(FOUL_HIT.xy, FOUL_HIT.xy); // along 1B foul line to the arc
    // CCW arc through the outfield apex (passes through (0, 60.5 + 95)).
    s.absarc(0, PLATE_TO_MOUND, GRASS_LINE_R, FOUL_HIT.ang, Math.PI - FOUL_HIT.ang, false);
    s.lineTo(-FOUL_HIT.xy, FOUL_HIT.xy);
    s.lineTo(0, 0);
    return s;
  }, []);
  return (
    <mesh position={[0, Y_DIRT_FAN, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

// =====================================================================
// Infield grass diamond: corners AT the base positions (rounded by the
// dirt cutouts layered above). The home edge follows the home plate
// area circle from where each foul line exits it, so there's no
// triangular dirt wedge in front of the plate — just narrow basepath
// strips on the foul lines (rendered separately, layered above this).
// =====================================================================
function InfieldGrassDiamond() {
  const shape = useMemo(() => {
    const exitFirst = HOME_AREA_R / Math.SQRT2; // 9.19
    const s = new Shape();
    // Start where the 1B foul line exits the home plate circle.
    s.moveTo(exitFirst, exitFirst);
    s.lineTo(BASE_DIAG, BASE_DIAG); // 1B
    s.lineTo(0, TWO_BASE); // 2B
    s.lineTo(-BASE_DIAG, BASE_DIAG); // 3B
    s.lineTo(-exitFirst, exitFirst); // exit of 3B foul line from home plate circle
    // CW arc back along the home plate circle through (0, 13).
    s.absarc(0, 0, HOME_AREA_R, (3 * Math.PI) / 4, Math.PI / 4, true);

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
// Foul-line basepath dirt: 6-ft-wide strip centered on the foul line
// from the home-plate-area exit to the corresponding base cutout. Sits
// above the grass diamond, so the foul line reads as a real dirt strip
// (similar to 1B/3B basepaths in the reference photo).
// =====================================================================
function FoulLineBasepath({ side }: { side: "first" | "third" }) {
  const shape = useMemo(() => {
    const sign = side === "first" ? 1 : -1;
    // Extend each end 3 ft into its adjacent circle so the strip's
    // rectangular corners (which sit slightly outside the circles when
    // the centerline ends exactly on the circle edge) are safely covered.
    // Both ends are dirt, so the overlap is invisible.
    const overlap = 3;
    const homeEnd = (HOME_AREA_R - overlap) / Math.SQRT2;
    const baseEnd = (BASE_DIST - BASE_CUT_R + overlap) / Math.SQRT2;
    const fromXY: [number, number] = [sign * homeEnd, homeEnd];
    const toXY: [number, number] = [sign * baseEnd, baseEnd];
    const dx = toXY[0] - fromXY[0];
    const dy = toXY[1] - fromXY[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    // Perpendicular CCW
    const half = 3; // 6 ft wide / 2
    const px = -uy * half;
    const py = ux * half;
    const s = new Shape();
    s.moveTo(fromXY[0] - px, fromXY[1] - py);
    s.lineTo(toXY[0] - px, toXY[1] - py);
    s.lineTo(toXY[0] + px, toXY[1] + py);
    s.lineTo(fromXY[0] + px, fromXY[1] + py);
    s.closePath();
    return s;
  }, [side]);
  return (
    <mesh position={[0, Y_DIRT_FEATURE - 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

// =====================================================================
// Discrete dirt features that sit above the infield grass diamond.
// The base cutouts at each base overlap the grass diamond corners,
// creating the rounded-concave corner look from the reference photos.
// =====================================================================

function BaseCutout({ position }: { position: [number, number, number] }) {
  return (
    <mesh
      position={[position[0], Y_DIRT_FEATURE, position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <circleGeometry args={[BASE_CUT_R, 32]} />
      <meshStandardMaterial color={DIRT} roughness={0.92} metalness={0} />
    </mesh>
  );
}

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
  const height = 0.25; // ~3 inches, real MLB bases are canvas/foam blocks
  return (
    <mesh position={[position[0], Y_BASE + height / 2, position[2]]}>
      <boxGeometry args={[size, height, size]} />
      <meshStandardMaterial color="#f3f4f6" roughness={0.6} metalness={0.05} />
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

  // ~0.5" of extrusion gives the plate visible thickness without making
  // it look like a brick.
  const extrudeSettings = useMemo(
    () => ({ depth: 0.0417, bevelEnabled: false }),
    [],
  );

  return (
    <mesh position={[0, Y_PLATE, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
      <extrudeGeometry args={[plateShape, extrudeSettings]} />
      <meshStandardMaterial color="#f3f4f6" roughness={0.55} metalness={0.05} />
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
