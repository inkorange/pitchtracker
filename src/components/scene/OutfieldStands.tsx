"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { MeshStandardMaterial } from "three";

// Procedural stadium ring for the outfield. Two curved strips sit on
// the negative-Z (outfield) side of the field, spanning foul-line to
// foul-line:
//
//   1. The outfield wall — a vertical curved strip 8 ft tall at the
//      WALL_RADIUS, classic ballpark dark green.
//   2. A sloped seating tier behind the wall — a curved ramp that
//      rises from the wall's top to TIER_TOP_HEIGHT, with a row/aisle
//      pattern painted on by a shader patch so it reads as "stands"
//      without per-seat geometry.
//
// Both meshes are single-sided (FrontSide) and wound so the visible
// face points inward toward home plate. From the back side they'd be
// invisible, which is fine — the camera lives inside the field.
//
// Coordinate convention matches Stage.tsx: plate at (0,0,0), outfield
// in the -Z direction. The arc spans -135° → -45° measured from +X
// (1B foul-pole at angle -45°, 3B foul-pole at -135°, dead center at
// angle -90° / position (0, 0, -WALL_RADIUS)).

const WALL_RADIUS = 350; // ft from home plate
const WALL_HEIGHT = 8; // ~classic outfield wall height
const TIER_INNER_RADIUS = WALL_RADIUS + 2; // small gap behind the wall
const TIER_DEPTH = 24; // ramp depth (radial)
const TIER_RISE = 22; // total vertical rise of the tier
const TIER_BASE_HEIGHT = WALL_HEIGHT; // tier inner edge sits at wall top
const TIER_TOP_HEIGHT = TIER_BASE_HEIGHT + TIER_RISE;
const TIER_OUTER_RADIUS = TIER_INNER_RADIUS + TIER_DEPTH;
const ARC_START = (-3 * Math.PI) / 4; // -135° = 3B foul line at the wall
const ARC_END = -Math.PI / 4; // -45° = 1B foul line at the wall
const ARC_SEGMENTS = 96; // smoothness of the curve

const WALL_COLOR = "#1c3b1c"; // deep ballpark green
const WALL_TRIM_COLOR = "#e6c945"; // yellow homer-line at the top

// Curved vertical wall: two-vertex column per segment (bottom + top).
function useWallGeometry() {
  return useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const angle = ARC_START + (ARC_END - ARC_START) * t;
      const x = WALL_RADIUS * Math.cos(angle);
      const z = WALL_RADIUS * Math.sin(angle);
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
// boundary" yellow line at the top of an outfield fence.
function useWallTrimGeometry() {
  return useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    const trimThickness = 0.6;
    const trimYBottom = WALL_HEIGHT - 0.4;
    const trimYTop = WALL_HEIGHT + 0.2;
    const trimRadius = WALL_RADIUS - 0.05; // tiny inset so it doesn't z-fight the wall
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const angle = ARC_START + (ARC_END - ARC_START) * t;
      const x = trimRadius * Math.cos(angle);
      const z = trimRadius * Math.sin(angle);
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
    void trimThickness; // currently a flat strip, not extruded
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

// Sloped seating ramp: inner edge at (radius=TIER_INNER_RADIUS,
// y=TIER_BASE_HEIGHT), outer edge at (radius=TIER_OUTER_RADIUS,
// y=TIER_TOP_HEIGHT). Rises ~22 ft over ~24 ft of depth → ~42° tier
// slope, similar to upper-deck nosebleeds.
function useTierGeometry() {
  return useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const angle = ARC_START + (ARC_END - ARC_START) * t;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      positions.push(
        TIER_INNER_RADIUS * cos,
        TIER_BASE_HEIGHT,
        TIER_INNER_RADIUS * sin,
      ); // inner edge (bottom-front)
      positions.push(
        TIER_OUTER_RADIUS * cos,
        TIER_TOP_HEIGHT,
        TIER_OUTER_RADIUS * sin,
      ); // outer edge (top-back)
    }
    for (let i = 0; i < ARC_SEGMENTS; i++) {
      const bl = i * 2; // inner-bottom of segment i
      const tl = i * 2 + 1; // outer-top of segment i
      const br = (i + 1) * 2; // inner-bottom of segment i+1
      const tr = (i + 1) * 2 + 1; // outer-top of segment i+1
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

// Shader-patched standard material for the seating tier. Paints
// alternating-color horizontal rows (every ~2 ft of vertical) and dark
// radial aisles every ~50 ft of arc length so the ramp reads as a
// section of seats from a distance without modeling per-seat geometry.
function useSeatsMaterial() {
  return useMemo(() => {
    const mat = new MeshStandardMaterial({
      color: "#2c3a55",
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
          // Row stripes: alternate two seat shades every ~2 ft of
          // vertical rise so the ramp reads as horizontal rows.
          float ROW_H = 2.0;
          float row = floor((vStandsWorldPos.y - ${TIER_BASE_HEIGHT.toFixed(1)}) / ROW_H);
          float rowMod = mod(row, 2.0);
          vec3 darkSeat = vec3(0.12, 0.16, 0.30);
          vec3 lightSeat = vec3(0.18, 0.24, 0.42);
          vec3 seatColor = mix(darkSeat, lightSeat, rowMod);

          // Thin darker line at each row boundary so individual rows
          // are visible even at distance — looks like a step shadow.
          float rowFrac = fract((vStandsWorldPos.y - ${TIER_BASE_HEIGHT.toFixed(1)}) / ROW_H);
          if (rowFrac < 0.08) seatColor *= 0.65;

          // Radial aisles: every ~50 ft of arc length AT THE WALL.
          // Earlier version used the point's own radius for arcLength,
          // but radius rises with Y across the tier slope (352 at the
          // bottom, ~376 at the top), so the aisle-modulo value drifted
          // upward with Y and the aisles rendered as slanted streaks.
          // Anchoring to the wall radius makes the test depend purely
          // on angular position, so an aisle is a true radial slice —
          // every height at the same angle gets the same value, and
          // the aisles read as vertical lines pointing at home plate.
          float angle = atan(vStandsWorldPos.z, vStandsWorldPos.x);
          float AISLE_SPACING = 50.0;
          float arcAtWall = ${WALL_RADIUS.toFixed(1)} * angle;
          float aisleFrac = fract(arcAtWall / AISLE_SPACING + 0.5);
          float aisleDist = abs(aisleFrac - 0.5) * AISLE_SPACING * 2.0;
          if (aisleDist < 1.5) seatColor = vec3(0.05, 0.07, 0.14);

          diffuseColor.rgb = seatColor;
          `,
        );
    };
    return mat;
  }, []);
}

export function OutfieldStands() {
  const wallGeom = useWallGeometry();
  const wallTrimGeom = useWallTrimGeometry();
  const tierGeom = useTierGeometry();
  const wallMat = useWallMaterial();
  const trimMat = useWallTrimMaterial();
  const seatsMat = useSeatsMaterial();
  return (
    <group>
      <mesh geometry={wallGeom} material={wallMat} />
      <mesh geometry={wallTrimGeom} material={trimMat} />
      <mesh geometry={tierGeom} material={seatsMat} />
    </group>
  );
}
