"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { MeshStandardMaterial } from "three";

// Closed stadium bowl encircling the field. A single wall + sloped
// seating tier sweep the full 360° around home plate, with the wall
// radius varying smoothly by angle:
//
//   r(θ) = R_MEAN + R_AMP · cos(θ − OUTFIELD_BEARING)
//
// θ = atan2(z, x). When θ aligns with the outfield bearing (−π/2 =
// dead center, −Z direction), r = OUTFIELD_RADIUS (deepest). At the
// opposite angle (+π/2, behind home plate), r = BACKSTOP_RADIUS
// (tightest — the catcher's backstop). The foul-line sides land at
// the mean, so the bowl reads as an oval elongated toward the outfield
// — matching the classic horseshoe-with-closed-back shape.
//
// Both meshes are FrontSide with inward-facing winding; their normals
// point toward home plate. From outside the bowl they're invisible —
// the camera lives inside the field and the CameraRig clamp keeps it
// from poking past the backstop wall.

export const BACKSTOP_RADIUS = 85;
export const OUTFIELD_RADIUS = 350;
const R_MEAN = (BACKSTOP_RADIUS + OUTFIELD_RADIUS) / 2;
const R_AMP = (OUTFIELD_RADIUS - BACKSTOP_RADIUS) / 2;
// −π/2: deep center is in the −Z direction in this scene's coords.
const OUTFIELD_BEARING = -Math.PI / 2;

const WALL_HEIGHT = 8;

// Lower deck (closest to the field): begins 2 ft behind the wall, 24
// ft deep, rises 22 ft. ~42° overall slope, but the surface is built
// as N stepped rows so the geometry physically looks like stadium
// stairs (visible treads + risers) rather than a smooth ramp.
const LOWER_INNER_OFFSET = 2;
const LOWER_DEPTH = 24;
const LOWER_RISE = 22;
const LOWER_BASE_HEIGHT = WALL_HEIGHT;
const LOWER_TOP_HEIGHT = LOWER_BASE_HEIGHT + LOWER_RISE;
const LOWER_ROWS = 12; // → 2.0 ft tread, 1.83 ft rise per row

// Cantilever: the upper deck overhangs forward over the back of the
// lower deck. CONCOURSE_RADIAL_OVERLAP ft of the upper-deck inner
// edge sits inside the lower deck's outer-edge radial position, so
// the rearmost rows of the lower bowl are physically under the
// upper-deck overhang — classic two-deck stadium look. The vertical
// CLEARANCE is the under-deck height between the lower deck's top
// and the upper deck's underside; that's where the concourse /
// standing area lives in a real ballpark.
const CONCOURSE_RADIAL_OVERLAP = 6;
const CONCOURSE_VERTICAL_CLEARANCE = 4;

// Upper deck (cheap seats / nosebleeds): cantilevered forward over
// the lower deck back rows, sitting taller and deeper to dominate
// the bowl silhouette.
const UPPER_INNER_OFFSET =
  LOWER_INNER_OFFSET + LOWER_DEPTH - CONCOURSE_RADIAL_OVERLAP;
const UPPER_DEPTH = 32;
const UPPER_RISE = 38;
const UPPER_BASE_HEIGHT = LOWER_TOP_HEIGHT + CONCOURSE_VERTICAL_CLEARANCE;
const UPPER_TOP_HEIGHT = UPPER_BASE_HEIGHT + UPPER_RISE;
const UPPER_ROWS = 20; // → 1.6 ft tread, 1.9 ft rise per row

const ARC_SEGMENTS = 256;
const SEGMENT_ANGLE = (2 * Math.PI) / ARC_SEGMENTS;

const WALL_COLOR = "#1c3b1c";
const WALL_TRIM_COLOR = "#e6c945";

// Wall radius at any bearing around home plate. Exported so other
// scene components (e.g. FoulLines) can terminate cleanly at the wall.
export function wallRadiusAtAngle(angle: number): number {
  return R_MEAN + R_AMP * Math.cos(angle - OUTFIELD_BEARING);
}

function useWallGeometry() {
  return useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const angle = -Math.PI + i * SEGMENT_ANGLE;
      const r = wallRadiusAtAngle(angle);
      const x = r * Math.cos(angle);
      const z = r * Math.sin(angle);
      positions.push(x, 0, z); // bottom
      positions.push(x, WALL_HEIGHT, z); // top
    }
    for (let i = 0; i < ARC_SEGMENTS; i++) {
      const bl = i * 2;
      const tl = i * 2 + 1;
      const br = (i + 1) * 2;
      const tr = (i + 1) * 2 + 1;
      // Winding gives an inward-facing normal (toward home plate).
      indices.push(bl, br, tl);
      indices.push(tl, br, tr);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }, []);
}

// Thin yellow trim strip on top of the wall — the classic "home run
// boundary" yellow line at the top of an outfield fence. Continues all
// the way around the bowl; reads as the cap of the lower-deck wall
// behind the plate too.
function useWallTrimGeometry() {
  return useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    const trimYBottom = WALL_HEIGHT - 0.4;
    const trimYTop = WALL_HEIGHT + 0.2;
    const trimRadialInset = 0.05; // tiny inset so it doesn't z-fight the wall
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const angle = -Math.PI + i * SEGMENT_ANGLE;
      const r = wallRadiusAtAngle(angle) - trimRadialInset;
      const x = r * Math.cos(angle);
      const z = r * Math.sin(angle);
      positions.push(x, trimYBottom, z);
      positions.push(x, trimYTop, z);
    }
    for (let i = 0; i < ARC_SEGMENTS; i++) {
      const bl = i * 2;
      const tl = i * 2 + 1;
      const br = (i + 1) * 2;
      const tr = (i + 1) * 2 + 1;
      indices.push(bl, br, tl);
      indices.push(tl, br, tr);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }, []);
}

// Stepped seating tier factory. Builds the tier as N rows of physical
// stairs — each row contributes a horizontal "tread" (the floor of
// that row of seats) plus a vertical "riser" (the front face of the
// row above). The strips follow the wall's variable radius all the
// way around the bowl.
//
// Why stepped and not a smooth slope: from a low field-level camera,
// a smooth slope reads as a flat panel of color. Stepped geometry
// gives the front faces (risers) of each row real horizontal-band
// presence — the same visual cue the reference cross-section
// diagrams show. The stairs visibly lean back up away from the field.
//
// Tread/riser dimensions:
//   rowDepth = totalDepth / numRows  → horizontal width of one row
//   rowRise  = totalRise / numRows   → vertical height between rows
//
// Returns one geometry that contains all 2N−1 strips (N treads + N−1
// risers between them). Top of the topmost tread is left open — a
// roof / facade is a separate concern.
function buildSteppedTierGeometry(
  innerOffset: number,
  totalDepth: number,
  baseHeight: number,
  totalRise: number,
  numRows: number,
): THREE.BufferGeometry {
  const rowDepth = totalDepth / numRows;
  const rowRise = totalRise / numRows;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row < numRows; row++) {
    const treadY = baseHeight + row * rowRise;
    const innerOff = innerOffset + row * rowDepth;
    const outerOff = innerOff + rowDepth;

    // === TREAD: horizontal strip at treadY, inner→outer in radius ===
    const treadStart = positions.length / 3;
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const angle = -Math.PI + i * SEGMENT_ANGLE;
      const wallR = wallRadiusAtAngle(angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      positions.push((wallR + innerOff) * cos, treadY, (wallR + innerOff) * sin);
      positions.push((wallR + outerOff) * cos, treadY, (wallR + outerOff) * sin);
    }
    for (let i = 0; i < ARC_SEGMENTS; i++) {
      const bl = treadStart + i * 2;
      const tl = treadStart + i * 2 + 1;
      const br = treadStart + (i + 1) * 2;
      const tr = treadStart + (i + 1) * 2 + 1;
      // Winding gives upward (+Y) normals — tread faces up toward sky.
      indices.push(bl, br, tl);
      indices.push(tl, br, tr);
    }

    // === RISER: vertical strip at outerOff, treadY → nextTreadY ===
    if (row < numRows - 1) {
      const nextTreadY = treadY + rowRise;
      const riserStart = positions.length / 3;
      for (let i = 0; i <= ARC_SEGMENTS; i++) {
        const angle = -Math.PI + i * SEGMENT_ANGLE;
        const wallR = wallRadiusAtAngle(angle);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        positions.push(
          (wallR + outerOff) * cos,
          treadY,
          (wallR + outerOff) * sin,
        );
        positions.push(
          (wallR + outerOff) * cos,
          nextTreadY,
          (wallR + outerOff) * sin,
        );
      }
      for (let i = 0; i < ARC_SEGMENTS; i++) {
        const bl = riserStart + i * 2;
        const tl = riserStart + i * 2 + 1;
        const br = riserStart + (i + 1) * 2;
        const tr = riserStart + (i + 1) * 2 + 1;
        // Winding gives inward normals — riser faces toward home plate
        // (the field side, where the camera lives).
        indices.push(bl, br, tl);
        indices.push(tl, br, tr);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function useLowerTierGeometry() {
  return useMemo(
    () =>
      buildSteppedTierGeometry(
        LOWER_INNER_OFFSET,
        LOWER_DEPTH,
        LOWER_BASE_HEIGHT,
        LOWER_RISE,
        LOWER_ROWS,
      ),
    [],
  );
}

function useUpperTierGeometry() {
  return useMemo(
    () =>
      buildSteppedTierGeometry(
        UPPER_INNER_OFFSET,
        UPPER_DEPTH,
        UPPER_BASE_HEIGHT,
        UPPER_RISE,
        UPPER_ROWS,
      ),
    [],
  );
}

function useWallMaterial() {
  return useMemo(
    () =>
      new MeshStandardMaterial({
        color: WALL_COLOR,
        roughness: 0.85,
        metalness: 0,
        side: THREE.FrontSide,
      }),
    [],
  );
}

function useWallTrimMaterial() {
  return useMemo(
    () =>
      new MeshStandardMaterial({
        color: WALL_TRIM_COLOR,
        roughness: 0.7,
        metalness: 0,
        side: THREE.FrontSide,
      }),
    [],
  );
}

// Shader-patched standard material for a seating tier. Paints
// alternating-color horizontal rows + dark radial aisles by angular
// position so the aisle lines stay straight (point at home plate)
// regardless of the seat point's actual height/radius.
//
// Parameterized so the lower and upper decks can share one builder
// but render with their own row baseline and seat tint — the upper
// deck reads as a slightly darker, recessed band so the lower deck
// remains the visual focal point.
interface SeatPalette {
  base: string;
  darkRow: string; // glsl vec3 components: "0.12, 0.16, 0.30"
  lightRow: string;
  aisle: string;
}

function buildSeatsMaterial(
  baseY: number,
  rowRise: number,
  palette: SeatPalette,
): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    color: palette.base,
    roughness: 0.7,
    metalness: 0,
    side: THREE.FrontSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vStandsWorldPos;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\nvStandsWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vStandsWorldPos;
        `,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // Row stripes alternate two shades every rowRise of vertical
        // rise. With stepped geometry every point on a tread shares one
        // Y, so each tread is uniformly colored and adjacent treads
        // alternate light/dark — the rows read clearly from any
        // viewing angle. Risers span (rowY → rowY + rowRise) so they
        // show as a transition between two adjacent row colors, which
        // emphasizes the stepped look at distance.
        float ROW_H = ${rowRise.toFixed(3)};
        float row = floor((vStandsWorldPos.y - ${baseY.toFixed(1)}) / ROW_H);
        float rowMod = mod(row, 2.0);
        vec3 darkSeat = vec3(${palette.darkRow});
        vec3 lightSeat = vec3(${palette.lightRow});
        vec3 seatColor = mix(darkSeat, lightSeat, rowMod);

        // Radial aisles: angular pattern. ~36 aisles around the bowl
        // (one every 10°). Using angular position rather than arc
        // length keeps the aisle as a true radial slice — every
        // height at the same angle gets the same value, so aisles
        // render as straight lines pointing at home plate.
        float angle = atan(vStandsWorldPos.z, vStandsWorldPos.x);
        float AISLE_COUNT = 36.0;
        float angleNorm = (angle + 3.14159265) / (2.0 * 3.14159265);
        float aisleFrac = fract(angleNorm * AISLE_COUNT);
        float aisleDist = abs(aisleFrac - 0.5);
        if (aisleDist > 0.46) seatColor = vec3(${palette.aisle});

        diffuseColor.rgb = seatColor;
        `,
      );
  };
  return mat;
}

const LOWER_PALETTE: SeatPalette = {
  base: "#2c3a55",
  darkRow: "0.12, 0.16, 0.30",
  lightRow: "0.18, 0.24, 0.42",
  aisle: "0.05, 0.07, 0.14",
};

// Upper deck: slightly darker + more muted than the lower deck so the
// two decks read as distinct horizontal bands and the lower deck
// stays the eye's focal point.
const UPPER_PALETTE: SeatPalette = {
  base: "#1f2940",
  darkRow: "0.09, 0.12, 0.23",
  lightRow: "0.14, 0.18, 0.33",
  aisle: "0.04, 0.05, 0.10",
};

function useLowerSeatsMaterial() {
  return useMemo(
    () =>
      buildSeatsMaterial(
        LOWER_BASE_HEIGHT,
        LOWER_RISE / LOWER_ROWS,
        LOWER_PALETTE,
      ),
    [],
  );
}

function useUpperSeatsMaterial() {
  return useMemo(
    () =>
      buildSeatsMaterial(
        UPPER_BASE_HEIGHT,
        UPPER_RISE / UPPER_ROWS,
        UPPER_PALETTE,
      ),
    [],
  );
}

export function StadiumBowl() {
  const wallGeom = useWallGeometry();
  const wallTrimGeom = useWallTrimGeometry();
  const lowerTierGeom = useLowerTierGeometry();
  const upperTierGeom = useUpperTierGeometry();
  const wallMat = useWallMaterial();
  const trimMat = useWallTrimMaterial();
  const lowerSeatsMat = useLowerSeatsMaterial();
  const upperSeatsMat = useUpperSeatsMaterial();
  return (
    <group>
      <mesh geometry={wallGeom} material={wallMat} />
      <mesh geometry={wallTrimGeom} material={trimMat} />
      <mesh geometry={lowerTierGeom} material={lowerSeatsMat} />
      <mesh geometry={upperTierGeom} material={upperSeatsMat} />
    </group>
  );
}
