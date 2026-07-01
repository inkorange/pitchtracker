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

// Target slope from horizontal for every deck: 40° — i.e., the
// interior angle at the base of the stands (measured between the
// field extending outward and the stands sloping up-and-back) is 140°.
// Real ballpark seating decks land around 30–40°; anything steeper
// starts to read visually as a WALL of risers instead of a tilted
// grandstand. tan(40°) ≈ 0.839, so we size every deck's rise as
// depth × 0.839 (rounded to friendly ft values).

// Lower deck (closest to the field): begins 2 ft behind the wall, 26
// ft deep, rises 22 ft. Overall slope atan(22/26) ≈ 40.2°. The
// surface is built as N stepped rows so the geometry physically
// looks like stadium stairs (visible treads + risers) rather than a
// smooth ramp.
const LOWER_INNER_OFFSET = 2;
const LOWER_DEPTH = 26;
const LOWER_RISE = 22;
const LOWER_BASE_HEIGHT = WALL_HEIGHT;
const LOWER_TOP_HEIGHT = LOWER_BASE_HEIGHT + LOWER_RISE;
const LOWER_ROWS = 12; // → 2.17 ft tread, 1.83 ft rise per row

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

// Upper deck (mid-tier / club level): cantilevered forward over the
// lower deck back rows. 40 ft deep, 34 ft rise — same 40° slope as
// the other decks so the whole silhouette leans consistently instead
// of getting progressively steeper (and reading as a wall) upward.
const UPPER_INNER_OFFSET =
  LOWER_INNER_OFFSET + LOWER_DEPTH - CONCOURSE_RADIAL_OVERLAP;
const UPPER_DEPTH = 40;
const UPPER_RISE = 34;
const UPPER_BASE_HEIGHT = LOWER_TOP_HEIGHT + CONCOURSE_VERTICAL_CLEARANCE;
const UPPER_TOP_HEIGHT = UPPER_BASE_HEIGHT + UPPER_RISE;
const UPPER_ROWS = 18; // → 2.22 ft tread, 1.89 ft rise per row

// Top deck (cheap seats / nosebleeds): cantilevered forward over the
// upper deck's back rows. Same 40° slope; fewer rows than the upper
// deck (16 vs 18) so each tread is slightly wider, matching the
// low-poly nosebleed feel.
const TOP_INNER_OFFSET =
  UPPER_INNER_OFFSET + UPPER_DEPTH - CONCOURSE_RADIAL_OVERLAP;
const TOP_DEPTH = 40;
const TOP_RISE = 34;
const TOP_BASE_HEIGHT = UPPER_TOP_HEIGHT + CONCOURSE_VERTICAL_CLEARANCE;
const TOP_TOP_HEIGHT = TOP_BASE_HEIGHT + TOP_RISE;
const TOP_ROWS = 16; // → 2.5 ft tread, 2.125 ft rise per row

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

function useTopTierGeometry() {
  return useMemo(
    () =>
      buildSteppedTierGeometry(
        TOP_INNER_OFFSET,
        TOP_DEPTH,
        TOP_BASE_HEIGHT,
        TOP_RISE,
        TOP_ROWS,
      ),
    [],
  );
}

// Curved vertical leading-face strip at the given radial offset,
// spanning from `faceBottomY` up to `faceTopY`. Used between decks
// to close the sky gap between a lower deck's back-most tread and
// the cantilevered upper deck's leading edge — without this, the
// vertical air between them reads as raw sky from any field-level
// camera angle. Painted with the wall material downstream so each
// leading face reads as part of the bowl's structural facade.
function buildLeadingFaceGeometry(
  innerOffset: number,
  bottomY: number,
  topY: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const angle = -Math.PI + i * SEGMENT_ANGLE;
    const wallR = wallRadiusAtAngle(angle);
    const r = wallR + innerOffset;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.push(r * cos, bottomY, r * sin);
    positions.push(r * cos, topY, r * sin);
  }
  for (let i = 0; i < ARC_SEGMENTS; i++) {
    const bl = i * 2;
    const tl = i * 2 + 1;
    const br = (i + 1) * 2;
    const tr = (i + 1) * 2 + 1;
    // Inward-facing normals (same winding as the wall).
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
}

function useUpperDeckLeadingFaceGeometry() {
  return useMemo(() => {
    const lowerRowDepth = LOWER_DEPTH / LOWER_ROWS;
    const lowerRowRise = LOWER_RISE / LOWER_ROWS;
    // Which lower-deck row's front edge lines up with the upper deck's
    // inner radial offset — the face starts at that row's tread Y, so
    // it sits flush against the back of one of the lower-deck rows
    // rather than starting above or below it.
    const rowIdx = Math.floor(
      (UPPER_INNER_OFFSET - LOWER_INNER_OFFSET) / lowerRowDepth,
    );
    const faceBottomY = LOWER_BASE_HEIGHT + rowIdx * lowerRowRise;
    return buildLeadingFaceGeometry(
      UPPER_INNER_OFFSET,
      faceBottomY,
      UPPER_BASE_HEIGHT,
    );
  }, []);
}

function useTopDeckLeadingFaceGeometry() {
  return useMemo(() => {
    const upperRowDepth = UPPER_DEPTH / UPPER_ROWS;
    const upperRowRise = UPPER_RISE / UPPER_ROWS;
    const rowIdx = Math.floor(
      (TOP_INNER_OFFSET - UPPER_INNER_OFFSET) / upperRowDepth,
    );
    const faceBottomY = UPPER_BASE_HEIGHT + rowIdx * upperRowRise;
    return buildLeadingFaceGeometry(
      TOP_INNER_OFFSET,
      faceBottomY,
      TOP_BASE_HEIGHT,
    );
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

        // Crowd speckle: procedural per-cell coloring layered on top of
        // the row/aisle pattern so the tiers read as PEOPLE sitting in
        // seats, not solid painted sections. Sample world XZ at ~0.6 ft
        // per cell (one 'person'), hash to pseudo-random 0–1, remap to
        // a small palette of typical crowd colors (reds, blues, tans,
        // whites, grays, warm skin tones). A second hash gates the
        // 'presence' of each cell — some stay closer to seat base
        // color (empty seat), others fully take on the crowd tint.
        // Aisles keep their dark color regardless so aisle lines stay
        // visible through the speckle.
        if (aisleDist <= 0.46) {
          vec2 crowdCell = floor(vStandsWorldPos.xz * 1.6);
          float h1 = fract(sin(dot(crowdCell, vec2(12.9898, 78.233))) * 43758.5453);
          float h2 = fract(sin(dot(crowdCell + 1.7, vec2(39.34, 91.7))) * 43758.5453);
          vec3 crowd;
          if      (h1 < 0.18) crowd = vec3(0.72, 0.20, 0.20); // red jersey
          else if (h1 < 0.34) crowd = vec3(0.20, 0.35, 0.68); // blue jersey
          else if (h1 < 0.48) crowd = vec3(0.82, 0.75, 0.60); // tan / hat brim
          else if (h1 < 0.62) crowd = vec3(0.90, 0.90, 0.86); // white shirt
          else if (h1 < 0.76) crowd = vec3(0.28, 0.28, 0.30); // gray / dark
          else if (h1 < 0.88) crowd = vec3(0.85, 0.60, 0.45); // skin tone
          else                crowd = vec3(0.75, 0.55, 0.20); // gold / mustard
          float presence = smoothstep(0.15, 0.85, h2);
          seatColor = mix(seatColor, crowd, presence * 0.62);
        }

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

// Top deck (nosebleeds): darkest band. The crowd speckle carries most
// of the visual interest at this distance from the field — the seat
// tint recedes behind the per-cell "people" colors.
const TOP_PALETTE: SeatPalette = {
  base: "#161e30",
  darkRow: "0.07, 0.09, 0.18",
  lightRow: "0.11, 0.14, 0.26",
  aisle: "0.03, 0.04, 0.08",
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

function useTopSeatsMaterial() {
  return useMemo(
    () =>
      buildSeatsMaterial(
        TOP_BASE_HEIGHT,
        TOP_RISE / TOP_ROWS,
        TOP_PALETTE,
      ),
    [],
  );
}

// Sideline stands — straight grandstands running parallel to each
// foul line, 40 ft off the line in foul territory. Real ballparks have
// dedicated 1B-line and 3B-line seating that sits close to the field
// and PARALLEL to the foul line, not curved back along the main bowl.
// Without this, the sides of the smooth ellipse bowl sit ~220 ft off
// the plate at 0°/180° bearings, leaving the baselines feeling
// exposed. This drops in a rectangular stand along each foul line so
// the viewer sees stands hugging the sidelines from a
// behind-the-plate camera.
//
// Coord layout: build the stand centered on the foul-line direction
// (1B → +x/-z axis at 45°) with local Z along the line and local X
// perpendicular (out into foul territory), then rotate into place.
// Local origin sits at the near-plate end of the sideline stand.
// Box seats along the baselines: LOW to the ground — 3 rows tall,
// short. Real premium box seats sit maybe 4–8 ft above the field level
// so fans get a low-angle vantage. Not full grandstands. Slope still
// matches the main bowl's 40° so the row proportions read consistent
// (rise 5 / depth 6 → atan(5/6) ≈ 40°). No structural wall — the
// dugout-side railing gets absorbed by the first riser.
const SIDELINE_OFFSET = 25;   // perpendicular distance from foul line
const SIDELINE_NEAR = 30;     // start along the foul line (ft from plate)
const SIDELINE_LENGTH = 240;  // total length along the foul line
const SIDELINE_DEPTH = 6;
// One flat platform, tucked BEHIND the wall — the field view sees the
// wall + one row of crowd heads peeking over. No stepped tiers (the
// stepped tier read as "stands out on the field", which was wrong).
// TREAD_BELOW_WALL: how far below the wall's crest the platform sits.
// Small positive value → the crowd texture on the platform top pokes
// just above the wall's line, matching real box seats behind a
// dugout-height wall.
const SIDELINE_HEIGHT = 0;
const SIDELINE_ROWS = 1;
const SIDELINE_TREAD_BELOW_WALL = 0.3;
// Wall along the field-side of the box seats. A REAL wall (chest-high,
// ~4 ft) — not a decorative lip. From a low field-level camera this
// hides the stepped rows behind it so the box seats read as "premium
// seating behind a wall", not as stands rising up out of the fair
// grass. Referenced against real MLB sideline walls, which run 3–4 ft
// where the netting takes over above.
const SIDELINE_WALL_HEIGHT = 4;

// Builds one sideline grandstand IN WORLD COORDS from three basis
// vectors describing where the stand lives:
//
//   origin  — world position of the front-plate corner (the vertex
//             where the wall's near-plate end sits on the ground)
//   lineDir — unit vector along the foul line, pointing away from
//             home plate (defines the "length" direction of the stand)
//   perpDir — unit vector perpendicular to the foul line, pointing
//             AWAY from the field into foul territory (defines the
//             "depth" direction — treads step outward this way)
//
// Every vertex = origin + s·lineDir + d·perpDir + h·(0,1,0) where s
// runs 0..SIDELINE_LENGTH along the line, d runs 0..SIDELINE_DEPTH
// perpendicular, and h is the vertex height. Building directly in
// world coords sidesteps the rotation ambiguity that had the stands
// pointing the wrong way (front wall not facing the field).
function buildSidelineGeometry(
  origin: [number, number, number],
  lineDir: [number, number, number],
  perpDir: [number, number, number],
): { wall: THREE.BufferGeometry; tier: THREE.BufferGeometry } {
  const rowDepth = SIDELINE_DEPTH / SIDELINE_ROWS;
  const rowRise = SIDELINE_HEIGHT / SIDELINE_ROWS;
  const LENGTH_SEGMENTS = 32; // low-poly along the length

  const [ox, oy, oz] = origin;
  const [lx, ly, lz] = lineDir;
  const [px, py, pz] = perpDir;

  // Vertex helper: given s along line, d perpendicular, h up →
  // returns world (x,y,z).
  const worldXYZ = (
    s: number,
    d: number,
    h: number,
  ): [number, number, number] => [
    ox + s * lx + d * px,
    oy + s * ly + d * py + h,
    oz + s * lz + d * pz,
  ];

  // WALL — vertical strip along the near-field edge (d=0) running the
  // full length. Inward-facing normal points toward the field
  // (opposite of perpDir).
  const wallPos: number[] = [];
  const wallIdx: number[] = [];
  for (let i = 0; i <= LENGTH_SEGMENTS; i++) {
    const s = (SIDELINE_LENGTH * i) / LENGTH_SEGMENTS;
    wallPos.push(...worldXYZ(s, 0, 0)); // bottom
    wallPos.push(...worldXYZ(s, 0, SIDELINE_WALL_HEIGHT)); // top
  }
  for (let i = 0; i < LENGTH_SEGMENTS; i++) {
    const bl = i * 2;
    const tl = i * 2 + 1;
    const br = (i + 1) * 2;
    const tr = (i + 1) * 2 + 1;
    // Winding: as `s` increases we advance along +lineDir; +tl is
    // upward. For the field-facing normal (−perpDir), triangles
    // wound bl → br → tl / tl → br → tr give the cross product a
    // −perpDir component.
    wallIdx.push(bl, br, tl);
    wallIdx.push(tl, br, tr);
  }
  const wallGeom = new THREE.BufferGeometry();
  wallGeom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(wallPos, 3),
  );
  wallGeom.setIndex(wallIdx);
  wallGeom.computeVertexNormals();

  // TIER — stepped rows. Each row: horizontal tread at treadY spanning
  // (innerD → outerD) along perpDir, then a vertical riser to next
  // row's tread. Same winding convention as the main bowl tiers.
  const tierPos: number[] = [];
  const tierIdx: number[] = [];
  for (let row = 0; row < SIDELINE_ROWS; row++) {
    // Box seats sit BEHIND the wall, top just under the wall's crest.
    // With SIDELINE_ROWS=1 the tier is a single flat platform tucked
    // in behind — from the field you see the wall + a thin band of
    // crowd heads peeking over (real MLB box-seat look). Front row of
    // the old 3-row stepped tier was reading as "stands rising in
    // fair territory" — collapsing to 1 row hides that behind the wall.
    const treadY =
      SIDELINE_WALL_HEIGHT - SIDELINE_TREAD_BELOW_WALL + row * rowRise;
    const innerD = row * rowDepth;
    const outerD = innerD + rowDepth;

    // Tread — horizontal, normal +Y.
    {
      const start = tierPos.length / 3;
      for (let i = 0; i <= LENGTH_SEGMENTS; i++) {
        const s = (SIDELINE_LENGTH * i) / LENGTH_SEGMENTS;
        tierPos.push(...worldXYZ(s, innerD, treadY));
        tierPos.push(...worldXYZ(s, outerD, treadY));
      }
      for (let i = 0; i < LENGTH_SEGMENTS; i++) {
        const bl = start + i * 2;
        const tl = start + i * 2 + 1;
        const br = start + (i + 1) * 2;
        const tr = start + (i + 1) * 2 + 1;
        tierIdx.push(bl, br, tl);
        tierIdx.push(tl, br, tr);
      }
    }

    // Riser — vertical, at d=outerD, from treadY up to nextTreadY.
    // Field-facing normal (−perpDir).
    if (row < SIDELINE_ROWS - 1) {
      const start = tierPos.length / 3;
      const nextTreadY = treadY + rowRise;
      for (let i = 0; i <= LENGTH_SEGMENTS; i++) {
        const s = (SIDELINE_LENGTH * i) / LENGTH_SEGMENTS;
        tierPos.push(...worldXYZ(s, outerD, treadY));
        tierPos.push(...worldXYZ(s, outerD, nextTreadY));
      }
      for (let i = 0; i < LENGTH_SEGMENTS; i++) {
        const bl = start + i * 2;
        const tl = start + i * 2 + 1;
        const br = start + (i + 1) * 2;
        const tr = start + (i + 1) * 2 + 1;
        tierIdx.push(bl, br, tl);
        tierIdx.push(tl, br, tr);
      }
    }
  }
  const tierGeom = new THREE.BufferGeometry();
  tierGeom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(tierPos, 3),
  );
  tierGeom.setIndex(tierIdx);
  tierGeom.computeVertexNormals();

  return { wall: wallGeom, tier: tierGeom };
}

// Fills the ground-visible gap between the low box seats' back edge
// and the main bowl wall. Without it, from a behind-the-plate camera
// you see raw field between the box seats and the outfield bowl —
// the seating doesn't read as continuous around the field. The fill
// is a curved horizontal strip at the box seats' TOP height, fanning
// from the box seats' back edge radially out to the bowl wall so its
// far edge lands ON the wall regardless of angle. Same seat material
// as the box seats so it reads as an extension of the seating deck.
function buildSidelineBackFill(
  origin: [number, number, number],
  lineDir: [number, number, number],
  perpDir: [number, number, number],
): THREE.BufferGeometry {
  // Match the tread height of the box-seat platform so the back-fill
  // meets the tier's back edge flush (no vertical seam between the
  // box seats and the fill panel).
  const height = SIDELINE_WALL_HEIGHT - SIDELINE_TREAD_BELOW_WALL;
  const LENGTH_SEGMENTS = 64;

  // Cover the ENTIRE foul-territory strip between the foul line and
  // the bowl wall — from home plate all the way out to where the foul
  // line meets the wall — not just the strip behind the box seats.
  // Without this, from an aerial camera you see raw green grass in
  // the wedge past the box seats' far end AND between the foul line
  // and the sideline stands. Origin sits SIDELINE_OFFSET ft into foul
  // territory from the line; back out to the line itself (perp = 0)
  // for the front edge of the fill, then radially to the wall.
  //
  // FILL_LENGTH is how far along the FOUL LINE the fill extends
  // (starting from the sideline stands' near-plate end). The foul
  // line makes a 45° angle with the outfield bearing, so it meets
  // the wall at R_MEAN + R_AMP·cos(π/4) ≈ 311 ft from home plate.
  // 330 ft here (the real MLB foul-pole distance) safely covers it.
  const FILL_LENGTH = 330;
  // Foul line runs from HOME PLATE at angle -π/4 (1B) / -3π/4 (3B).
  // Origin sits at (SIDELINE_NEAR + SIDELINE_OFFSET) offset along the
  // foul line from plate + perp offset into foul territory. To land
  // the front vertex ON the foul line at world position s along the
  // line from PLATE, start from origin and back out the perp offset.
  // s here is distance from home plate along the foul line.
  const originPerpBackout: [number, number, number] = [
    origin[0] - SIDELINE_OFFSET * perpDir[0],
    origin[1] - SIDELINE_OFFSET * perpDir[1],
    origin[2] - SIDELINE_OFFSET * perpDir[2],
  ];
  // originPerpBackout is now the point on the foul line at
  // SIDELINE_NEAR ft from plate. Advance from there by (s − SIDELINE
  // _NEAR) along lineDir to get the foul-line point at distance s.

  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= LENGTH_SEGMENTS; i++) {
    // s is distance along the foul line from HOME PLATE.
    const s = (FILL_LENGTH * i) / LENGTH_SEGMENTS;
    const advance = s - SIDELINE_NEAR;
    // Front vertex: point on the foul line at distance s from plate.
    const fx = originPerpBackout[0] + advance * lineDir[0];
    const fz = originPerpBackout[2] + advance * lineDir[2];
    // Bowl wall at this angular direction. The foul line is a ray
    // from the plate at constant angle, so angF is effectively fixed
    // — but we compute per-vertex to be robust to the near-plate
    // segments where numerical noise can flip the sign of a
    // near-zero coordinate.
    const rF = Math.sqrt(fx * fx + fz * fz);
    const angF = Math.atan2(fz, fx);
    const rWall = wallRadiusAtAngle(angF);
    // Guard against the near-plate degenerate case (rF ≈ 0): fall
    // back to lineDir as the radial direction so we don't divide by
    // zero and produce a NaN vertex.
    const dirX = rF > 0.01 ? fx / rF : lineDir[0];
    const dirZ = rF > 0.01 ? fz / rF : lineDir[2];
    const bx = dirX * rWall;
    const bz = dirZ * rWall;
    positions.push(fx, height, fz); // 0: front (foul-line side)
    positions.push(bx, height, bz); // 1: back (bowl-wall side)
  }
  for (let i = 0; i < LENGTH_SEGMENTS; i++) {
    const fl = i * 2;
    const bl = i * 2 + 1;
    const fr = (i + 1) * 2;
    const br = (i + 1) * 2 + 1;
    // Winding chosen so the surface normal points +Y (up) — the top
    // face is what a camera above the fill plane sees.
    indices.push(fl, fr, bl);
    indices.push(bl, fr, br);
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

// Curved box seats wrapping BEHIND home plate, connecting the 1B
// sideline near-end to the 3B sideline near-end. Same 3-row / 5-ft
// scale as the sideline stands, but built as an angular arc around
// home plate rather than a straight run. Inner radius matches the
// sideline near-end distance so the two sections meet without a gap.
// Sweeps CCW from the 1B near-end angle through the +Z direction
// (directly behind plate) to the 3B near-end angle — roughly a
// 180-190° arc.
function buildBackstopArcGeometry(
  angleStart: number,
  angleEnd: number,
  innerRadius: number,
): THREE.BufferGeometry {
  const ARC_SEGMENTS_BACKSTOP = 72;
  const rowDepth = SIDELINE_DEPTH / SIDELINE_ROWS;
  const rowRise = SIDELINE_HEIGHT / SIDELINE_ROWS;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row < SIDELINE_ROWS; row++) {
    // Match the sideline tier: sit just below the wall's crest so the
    // wrap-around reads consistently — wall dominates, crowd peeks
    // over the top. Keeping the arc/wrap shape as-is (per user: "I
    // like the way you went around the home plate region, keep that")
    // — only the vertical placement changes.
    const treadY =
      SIDELINE_WALL_HEIGHT - SIDELINE_TREAD_BELOW_WALL + row * rowRise;
    const innerR = innerRadius + row * rowDepth;
    const outerR = innerR + rowDepth;

    // Tread — horizontal, normal +Y.
    {
      const start = positions.length / 3;
      for (let i = 0; i <= ARC_SEGMENTS_BACKSTOP; i++) {
        const t = i / ARC_SEGMENTS_BACKSTOP;
        const angle = angleStart + (angleEnd - angleStart) * t;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        positions.push(innerR * cos, treadY, innerR * sin);
        positions.push(outerR * cos, treadY, outerR * sin);
      }
      for (let i = 0; i < ARC_SEGMENTS_BACKSTOP; i++) {
        const bl = start + i * 2;
        const tl = start + i * 2 + 1;
        const br = start + (i + 1) * 2;
        const tr = start + (i + 1) * 2 + 1;
        indices.push(bl, br, tl);
        indices.push(tl, br, tr);
      }
    }

    // Riser — vertical at outerR, facing INWARD toward home plate.
    if (row < SIDELINE_ROWS - 1) {
      const start = positions.length / 3;
      const nextTreadY = treadY + rowRise;
      for (let i = 0; i <= ARC_SEGMENTS_BACKSTOP; i++) {
        const t = i / ARC_SEGMENTS_BACKSTOP;
        const angle = angleStart + (angleEnd - angleStart) * t;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        positions.push(outerR * cos, treadY, outerR * sin);
        positions.push(outerR * cos, nextTreadY, outerR * sin);
      }
      for (let i = 0; i < ARC_SEGMENTS_BACKSTOP; i++) {
        const bl = start + i * 2;
        const tl = start + i * 2 + 1;
        const br = start + (i + 1) * 2;
        const tr = start + (i + 1) * 2 + 1;
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

// Field-side wall in front of the backstop arc — the curved
// counterpart to the straight sideline wall. Sweeps the same angular
// arc as the tier at radius=innerRadius, rising from ground to
// SIDELINE_WALL_HEIGHT. Hides the front rows of the arc tier from a
// field-level camera and matches the sideline wall so the ring of
// wall reads as one continuous barrier from foul line, around
// backstop, to the other foul line.
function buildBackstopWallGeometry(
  angleStart: number,
  angleEnd: number,
  innerRadius: number,
): THREE.BufferGeometry {
  const ARC_SEGMENTS_BACKSTOP = 72;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= ARC_SEGMENTS_BACKSTOP; i++) {
    const t = i / ARC_SEGMENTS_BACKSTOP;
    const angle = angleStart + (angleEnd - angleStart) * t;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.push(innerRadius * cos, 0, innerRadius * sin);
    positions.push(
      innerRadius * cos,
      SIDELINE_WALL_HEIGHT,
      innerRadius * sin,
    );
  }
  for (let i = 0; i < ARC_SEGMENTS_BACKSTOP; i++) {
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
}

// Horizontal back-fill from the backstop arc's outer edge out to the
// main bowl wall at each angle. Closes the gap between the near-plate
// box seats and the outfield bowl (same role the sideline back-fill
// plays along the foul lines) so seating reads as continuous around
// the whole field.
function buildBackstopBackFill(
  angleStart: number,
  angleEnd: number,
  boxOuterRadius: number,
): THREE.BufferGeometry {
  const ARC_SEGMENTS_BACKSTOP = 72;
  // Same height as the sideline back-fill so the ring around the
  // whole field lies on one continuous plane.
  const height = SIDELINE_WALL_HEIGHT - SIDELINE_TREAD_BELOW_WALL;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= ARC_SEGMENTS_BACKSTOP; i++) {
    const t = i / ARC_SEGMENTS_BACKSTOP;
    const angle = angleStart + (angleEnd - angleStart) * t;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rWall = wallRadiusAtAngle(angle);
    // Front vertex — box-seat back edge at that angle.
    positions.push(boxOuterRadius * cos, height, boxOuterRadius * sin);
    // Back vertex — main bowl wall at that angle.
    positions.push(rWall * cos, height, rWall * sin);
  }
  for (let i = 0; i < ARC_SEGMENTS_BACKSTOP; i++) {
    const fl = i * 2;
    const bl = i * 2 + 1;
    const fr = (i + 1) * 2;
    const br = (i + 1) * 2 + 1;
    indices.push(fl, fr, bl);
    indices.push(bl, fr, br);
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

function useSidelineGeometries() {
  return useMemo(() => {
    const s = Math.SQRT2 / 2;
    // 1B foul line: from (0,0,0) toward (63.64, 0, -63.64).
    // lineDir = (+s, 0, -s). Perpendicular pointing into 1B foul
    // territory (right side of line when facing outfield from home):
    // (+s, 0, +s). Origin: SIDELINE_NEAR along the line + SIDELINE
    // OFFSET into the perpendicular.
    const line1B: [number, number, number] = [s, 0, -s];
    const perp1B: [number, number, number] = [s, 0, s];
    const origin1B: [number, number, number] = [
      SIDELINE_NEAR * s + SIDELINE_OFFSET * s,
      0,
      -SIDELINE_NEAR * s + SIDELINE_OFFSET * s,
    ];
    // 3B foul line: from (0,0,0) toward (-63.64, 0, -63.64).
    // lineDir = (-s, 0, -s). Perpendicular into 3B foul territory:
    // (-s, 0, +s). Symmetric origin on the -X side.
    const line3B: [number, number, number] = [-s, 0, -s];
    const perp3B: [number, number, number] = [-s, 0, s];
    const origin3B: [number, number, number] = [
      -SIDELINE_NEAR * s - SIDELINE_OFFSET * s,
      0,
      -SIDELINE_NEAR * s + SIDELINE_OFFSET * s,
    ];
    // Backstop arc anchor: use the 1B sideline's front-inner corner
    // (origin1B) as the near-plate endpoint. Compute its radial
    // distance + angle from home plate — the arc's inner radius matches
    // this distance and its endpoint angle matches this bearing.
    const nearRadius = Math.sqrt(
      origin1B[0] * origin1B[0] + origin1B[2] * origin1B[2],
    );
    const angle1B = Math.atan2(origin1B[2], origin1B[0]);
    const angle3B = Math.atan2(origin3B[2], origin3B[0]);
    // Sweep CCW from angle1B (slightly below +X axis) through the +Z
    // direction (behind home plate, at +π/2) to angle3B (slightly below
    // −X axis). Unwrap so the arc goes the LONG way (through +Z, not
    // through the outfield / −Z which is already covered by the main
    // bowl and sideline stands).
    const arcStart = angle1B;
    const arcEnd = angle3B < angle1B ? angle3B + 2 * Math.PI : angle3B;
    const boxOuterRadius = nearRadius + SIDELINE_DEPTH;

    return {
      first: {
        ...buildSidelineGeometry(origin1B, line1B, perp1B),
        backFill: buildSidelineBackFill(origin1B, line1B, perp1B),
      },
      third: {
        ...buildSidelineGeometry(origin3B, line3B, perp3B),
        backFill: buildSidelineBackFill(origin3B, line3B, perp3B),
      },
      backstop: {
        wall: buildBackstopWallGeometry(arcStart, arcEnd, nearRadius),
        tier: buildBackstopArcGeometry(arcStart, arcEnd, nearRadius),
        backFill: buildBackstopBackFill(arcStart, arcEnd, boxOuterRadius),
      },
    };
  }, []);
}

// Field-side wall in front of the box seats. Same green + trim look
// as the main bowl wall, but a distinct material so we can flag it as
// DoubleSide without opting the giant outfield wall into that cost.
function useSidelineWallMaterial() {
  return useMemo(() => {
    const mat = new MeshStandardMaterial({
      color: WALL_COLOR,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    return mat;
  }, []);
}

function useSidelineSeatsMaterial() {
  return useMemo(() => {
    const mat = buildSeatsMaterial(
      SIDELINE_WALL_HEIGHT,
      SIDELINE_HEIGHT / SIDELINE_ROWS,
      LOWER_PALETTE,
    );
    // Sideline & backstop-arc geometries are hand-built in world
    // coords from mirror-image direction pairs (1B uses +x/−z along
    // the line and +x/+z perpendicular; 3B mirrors). A single triangle
    // order can't give inward-facing normals on both sides, so we
    // just render both faces. Cheap — these are small stepped strips
    // (a few hundred tris total), the DoubleSide cost is negligible
    // and it fixes the 1B-side seats not rendering under FrontSide.
    mat.side = THREE.DoubleSide;
    return mat;
  }, []);
}

export function StadiumBowl() {
  const wallGeom = useWallGeometry();
  const wallTrimGeom = useWallTrimGeometry();
  const lowerTierGeom = useLowerTierGeometry();
  const upperLeadingGeom = useUpperDeckLeadingFaceGeometry();
  const upperTierGeom = useUpperTierGeometry();
  const topLeadingGeom = useTopDeckLeadingFaceGeometry();
  const topTierGeom = useTopTierGeometry();
  const sidelines = useSidelineGeometries();
  const wallMat = useWallMaterial();
  const trimMat = useWallTrimMaterial();
  const lowerSeatsMat = useLowerSeatsMaterial();
  const upperSeatsMat = useUpperSeatsMaterial();
  const topSeatsMat = useTopSeatsMaterial();
  const sidelineSeatsMat = useSidelineSeatsMaterial();
  const sidelineWallMat = useSidelineWallMaterial();

  return (
    <group>
      <mesh geometry={wallGeom} material={wallMat} />
      <mesh geometry={wallTrimGeom} material={trimMat} />
      <mesh geometry={lowerTierGeom} material={lowerSeatsMat} />
      {/* Closes the sky between the lower deck top and the upper
          deck's cantilevered leading edge. Reuses the wall material
          so it reads as part of the bowl's structural facade. */}
      <mesh geometry={upperLeadingGeom} material={wallMat} />
      <mesh geometry={upperTierGeom} material={upperSeatsMat} />
      {/* Same facade role between upper and top decks. */}
      <mesh geometry={topLeadingGeom} material={wallMat} />
      <mesh geometry={topTierGeom} material={topSeatsMat} />
      {/* Box seats along the foul lines. Built directly in world
          coords via useSidelineGeometries() so the wall+tier meshes
          already sit in the right place — no wrapping group rotation
          needed. Low to the ground (3 rows, ~5 ft tall) so they read
          as premium sideline boxes, not full grandstands overlapping
          the main bowl. */}
      <mesh geometry={sidelines.first.wall} material={sidelineWallMat} />
      <mesh geometry={sidelines.first.tier} material={sidelineSeatsMat} />
      <mesh geometry={sidelines.first.backFill} material={sidelineSeatsMat} />
      <mesh geometry={sidelines.third.wall} material={sidelineWallMat} />
      <mesh geometry={sidelines.third.tier} material={sidelineSeatsMat} />
      <mesh geometry={sidelines.third.backFill} material={sidelineSeatsMat} />
      {/* Backstop arc — box seats wrapping BEHIND home plate,
          connecting the 1B and 3B sideline near-ends. Same 3-row / 5-ft
          scale as the sidelines. Back-fill closes the gap between the
          arc's outer edge and the main bowl wall so seating reads as
          continuous all the way around the field. */}
      <mesh geometry={sidelines.backstop.wall} material={sidelineWallMat} />
      <mesh geometry={sidelines.backstop.tier} material={sidelineSeatsMat} />
      <mesh geometry={sidelines.backstop.backFill} material={sidelineSeatsMat} />
    </group>
  );
}
