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
const TIER_INNER_OFFSET = 2;
const TIER_DEPTH = 24;
const TIER_RISE = 22;
const TIER_BASE_HEIGHT = WALL_HEIGHT;
const TIER_TOP_HEIGHT = TIER_BASE_HEIGHT + TIER_RISE;

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

// Sloped seating ramp: inner edge sits at (wallR + TIER_INNER_OFFSET,
// y = WALL_HEIGHT), outer edge at (innerR + TIER_DEPTH, y = TIER_TOP).
// Rises ~22 ft over ~24 ft of depth → ~42° tier slope.
function useTierGeometry() {
  return useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const angle = -Math.PI + i * SEGMENT_ANGLE;
      const wallR = wallRadiusAtAngle(angle);
      const innerR = wallR + TIER_INNER_OFFSET;
      const outerR = innerR + TIER_DEPTH;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      positions.push(innerR * cos, TIER_BASE_HEIGHT, innerR * sin);
      positions.push(outerR * cos, TIER_TOP_HEIGHT, outerR * sin);
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
// alternating-color horizontal rows + dark radial aisles by angular
// position so the aisle lines stay straight (point at home plate)
// regardless of the seat point's actual height/radius.
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
          // Row stripes: alternate two seat shades every ~2 ft of rise.
          float ROW_H = 2.0;
          float row = floor((vStandsWorldPos.y - ${TIER_BASE_HEIGHT.toFixed(1)}) / ROW_H);
          float rowMod = mod(row, 2.0);
          vec3 darkSeat = vec3(0.12, 0.16, 0.30);
          vec3 lightSeat = vec3(0.18, 0.24, 0.42);
          vec3 seatColor = mix(darkSeat, lightSeat, rowMod);

          // Step shadow at each row boundary — keeps rows visible at distance.
          float rowFrac = fract((vStandsWorldPos.y - ${TIER_BASE_HEIGHT.toFixed(1)}) / ROW_H);
          if (rowFrac < 0.08) seatColor *= 0.65;

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
          if (aisleDist > 0.46) seatColor = vec3(0.05, 0.07, 0.14);

          diffuseColor.rgb = seatColor;
          `,
        );
    };
    return mat;
  }, []);
}

export function StadiumBowl() {
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
