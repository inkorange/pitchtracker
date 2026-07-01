"use client";

import { useMemo } from "react";
import { Line, useTexture } from "@react-three/drei";
import {
  MeshStandardMaterial,
  Path,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
} from "three";
import { StadiumBowl, wallRadiusAtAngle } from "./StadiumBowl";

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
// Vertical layering — every layer is 0.10 ft (≈ 1.2") above the
// previous one. That's small enough to be invisible from a
// ground-level camera (the plate is 17" wide, so 1.2" of stack
// height across multiple layers reads as flat ground), but large
// enough that even at top-down camera distances the depth buffer
// can still resolve every layer without flicker.
const Y_DIRT_FAN = 0.1;
const Y_INFIELD_GRASS = 0.2;
const Y_BASEPATH = 0.3;
const Y_DIRT_FEATURE = 0.4;
const Y_BASE = 0.5;
const Y_PLATE = 0.51;
const Y_LINE = 0.52;

// Mow-pattern shader: paints the classic ballpark crosshatch onto any grass
// mesh by sampling world XZ position. Stripes are aligned with the foul lines
// (one set parallel to the 1B line, one parallel to the 3B line); their
// overlap gives four shades — like a real reel mower laying down passes in
// alternating directions, then re-mowing perpendicular.
function useMowGrassMaterial() {
  return useMemo(() => {
    const mat = new MeshStandardMaterial({
      color: GRASS,
      roughness: 0.95,
      metalness: 0,
      // Distant grass fades to alpha 0 (see shader patch), so the field
      // dissolves into the sky instead of cutting off at a hard edge.
      transparent: true,
      depthWrite: false,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying vec3 vMowWorldPos;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\nvMowWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vMowWorldPos;
          float grassHash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }
          float grassNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            float a = grassHash21(i);
            float b = grassHash21(i + vec2(1.0, 0.0));
            float c = grassHash21(i + vec2(0.0, 1.0));
            float d = grassHash21(i + vec2(1.0, 1.0));
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
          }
          // Two octaves so the bump field has both blade clumps (low
          // freq) and individual blade-tip jitter (high freq).
          float grassBumpField(vec2 p) {
            return grassNoise(p * 1.8) * 0.55 + grassNoise(p * 6.0) * 0.45;
          }
          `,
        )
        // Match the dirt material: perturb the surface normal so the
        // directional lighting picks up bump-map relief on top of
        // the mow stripes.
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          {
            vec2 dp = vMowWorldPos.xz;
            float h0 = grassBumpField(dp);
            float hx = grassBumpField(dp + vec2(0.05, 0.0));
            float hz = grassBumpField(dp + vec2(0.0, 0.05));
            float gx = (hx - h0) / 0.05;
            float gz = (hz - h0) / 0.05;
            float BUMP_STRENGTH = 0.30;
            vec3 perturbed = normalize(vec3(-gx * BUMP_STRENGTH, 1.0, -gz * BUMP_STRENGTH));
            normal = normalize(mix(normal, perturbed, 0.7));
          }
          `,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          // Stripe directions perpendicular to the foul lines (so stripes RUN
          // parallel to them). Each stripe is ~10 ft wide.
          float STRIPE_W = 6.0;
          vec2 dirA = vec2(0.7071, 0.7071);   // perpendicular to 1B line
          vec2 dirB = vec2(0.7071, -0.7071);  // perpendicular to 3B line
          float a = dot(vMowWorldPos.xz, dirA) / (STRIPE_W * 2.0);
          float b = dot(vMowWorldPos.xz, dirB) / (STRIPE_W * 2.0);
          // Soft-edge stripe (smoothstep over a small fraction of one stripe).
          float fa = fract(a);
          float fb = fract(b);
          float sA = smoothstep(0.48, 0.52, fa) - smoothstep(0.98, 1.02, fa);
          float sB = smoothstep(0.48, 0.52, fb) - smoothstep(0.98, 1.02, fb);
          float blend = (sA + sB) * 0.5; // 0, 0.5, or 1
          vec3 darkGrass  = vec3(0.220, 0.315, 0.195);
          vec3 lightGrass = vec3(0.350, 0.470, 0.275);
          diffuseColor.rgb = mix(darkGrass, lightGrass, blend);
          // Distance-based alpha fade so the field dissolves into the
          // sky in the distance. Measured horizontally from home plate.
          float vMowDist = length(vMowWorldPos.xz);
          diffuseColor.a *= 1.0 - smoothstep(300.0, 650.0, vMowDist);
          `,
        );
    };
    return mat;
  }, []);
}

// Dirt material — samples /soil.jpg at world XZ so the tiling is
// continuous across every dirt mesh (infield fan, base cutouts, home
// circle, mound, basepaths) regardless of each mesh's own UVs. Then
// perturbs the normal from the same value-noise field the previous
// procedural version used, so the texture still picks up light-side
// / shadow-side highlights from directional lighting instead of
// reading as a flat painted image.
function useDirtMaterial() {
  const soilTexture = useTexture("/soil.jpg");
  return useMemo(() => {
    soilTexture.wrapS = RepeatWrapping;
    soilTexture.wrapT = RepeatWrapping;
    soilTexture.colorSpace = SRGBColorSpace;
    const mat = new MeshStandardMaterial({
      color: 0xffffff, // let the texture drive color
      map: soilTexture,
      roughness: 0.95,
      metalness: 0,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying vec3 vDirtWorldPos;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\nvDirtWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vDirtWorldPos;
          float dirtHash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }
          float dirtNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            float a = dirtHash21(i);
            float b = dirtHash21(i + vec2(1.0, 0.0));
            float c = dirtHash21(i + vec2(0.0, 1.0));
            float d = dirtHash21(i + vec2(1.0, 1.0));
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
          }
          // Two octaves weighted toward the high-frequency band so the
          // bumps read as fine clay grain rather than broad undulation.
          float dirtBumpField(vec2 p) {
            return dirtNoise(p * 2.0) * 0.35 + dirtNoise(p * 8.0) * 0.65;
          }
          `,
        )
        // Perturb the normal AFTER three.js's standard normal pipeline
        // has finished. Numerical gradient of the bump field gives
        // a per-pixel slope, which we treat as a tangent-space normal
        // and rotate into world space. Since every dirt mesh is laid
        // flat (geometry rotated -PI/2 around X so its face points
        // +Y in world), the world-up axis is the surface normal and
        // the bump's (∂h/∂x, ∂h/∂z) maps directly to a tilt.
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          {
            vec2 dp = vDirtWorldPos.xz;
            float h0 = dirtBumpField(dp);
            float hx = dirtBumpField(dp + vec2(0.05, 0.0));
            float hz = dirtBumpField(dp + vec2(0.0, 0.05));
            float gx = (hx - h0) / 0.05;
            float gz = (hz - h0) / 0.05;
            float BUMP_STRENGTH = 0.20;
            vec3 perturbed = normalize(vec3(-gx * BUMP_STRENGTH, 1.0, -gz * BUMP_STRENGTH));
            // Blend toward the perturbed normal — full replacement
            // would over-darken at glancing angles; mostly base.
            normal = normalize(mix(normal, perturbed, 0.7));
          }
          `,
        )
        // Replace the default map sampling (which uses per-mesh UVs)
        // with a world-space sample so the texture tiles at a constant
        // scale across every dirt mesh regardless of its individual
        // size / UVs. 0.25 in world units = one texture repeat per
        // ~4 ft, which reads as clay grain (individual pebbles + clay
        // clumps at scale) rather than a giant painted image.
        .replace(
          "#include <map_fragment>",
          `
          vec2 soilUV = vDirtWorldPos.xz * 0.25;
          vec4 sampledDiffuseColor = texture2D(map, soilUV);
          diffuseColor *= sampledDiffuseColor;
          `,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          // Subtle noise wash on top of the sampled texture so the
          // repeat isn't perfectly uniform across the field. Narrow
          // range because the texture already carries color detail.
          float tintN = dirtNoise(vDirtWorldPos.xz * 0.25);
          diffuseColor.rgb *= mix(0.92, 1.05, tintN);
          `,
        );
    };
    return mat;
  }, [soilTexture]);
}

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
  const mowMaterial = useMowGrassMaterial();
  const dirtMaterial = useDirtMaterial();
  return (
    <group>
      <OutfieldGrass material={mowMaterial} />
      <InfieldDirtFan material={dirtMaterial} />
      <InfieldGrassDiamond material={mowMaterial} />
      <FoulLineBasepath side="first" material={dirtMaterial} />
      <FoulLineBasepath side="third" material={dirtMaterial} />
      <BaseCutout position={FIRST_BASE} material={dirtMaterial} />
      <BaseCutout position={SECOND_BASE} material={dirtMaterial} />
      <BaseCutout position={THIRD_BASE} material={dirtMaterial} />
      <HomePlateArea material={dirtMaterial} />
      <MoundDirt material={dirtMaterial} />
      <FoulLines />
      <Base position={FIRST_BASE} />
      <Base position={SECOND_BASE} />
      <Base position={THIRD_BASE} />
      <HomePlate />
      <Mound />
      <StrikeZone />
      <StadiumBowl />
    </group>
  );
}

// =====================================================================
// Outfield grass: a large square plane centered slightly forward of
// home so it covers the field plus generous margins to the sides and
// behind the plate. No more black void around the field.
// =====================================================================
function OutfieldGrass({ material }: { material: MeshStandardMaterial }) {
  return (
    <mesh
      position={[0, Y_GRASS_BASE, -200]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      // Force grass to render before any other transparent geometry.
      // mowMaterial uses transparent + depthWrite:false for the
      // distance fade; without an explicit render order, three.js
      // sorts the grass by centroid distance and at certain camera
      // angles the grass ends up sorted AFTER pitch ribbons, masking
      // them. Drawing grass first removes that ambiguity entirely.
      renderOrder={-1}
    >
      <planeGeometry args={[1400, 1400]} />
    </mesh>
  );
}

// =====================================================================
// Infield dirt fan: bounded by foul lines from home and the 95-ft arc
// from the front of the rubber. Includes the area past 2B where the
// dirt curves through the outfield.
// =====================================================================
function InfieldDirtFan({ material }: { material: MeshStandardMaterial }) {
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
    <mesh
      position={[0, Y_DIRT_FAN, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
    >
      <shapeGeometry args={[shape]} />
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
function InfieldGrassDiamond({ material }: { material: MeshStandardMaterial }) {
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
    <mesh
      position={[0, Y_INFIELD_GRASS, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      renderOrder={-1}
    >
      <shapeGeometry args={[shape]} />
    </mesh>
  );
}

// =====================================================================
// Foul-line basepath dirt: 6-ft-wide strip centered on the foul line
// from the home-plate-area exit to the corresponding base cutout. Sits
// above the grass diamond, so the foul line reads as a real dirt strip
// (similar to 1B/3B basepaths in the reference photo).
// =====================================================================
function FoulLineBasepath({
  side,
  material,
}: {
  side: "first" | "third";
  material: MeshStandardMaterial;
}) {
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
    <mesh
      // Dedicated layer between the grass diamond and the home-plate
      // circle / base cutouts. With Y_BASEPATH = 0.15 and
      // Y_DIRT_FEATURE = 0.20, the basepath sits 0.05 above the
      // grass diamond and 0.05 below the discs that cap each end —
      // enough headroom for depth-test ordering to be unambiguous.
      position={[0, Y_BASEPATH, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
    >
      <shapeGeometry args={[shape]} />
    </mesh>
  );
}

// =====================================================================
// Discrete dirt features that sit above the infield grass diamond.
// The base cutouts at each base overlap the grass diamond corners,
// creating the rounded-concave corner look from the reference photos.
// =====================================================================

function BaseCutout({
  position,
  material,
}: {
  position: [number, number, number];
  material: MeshStandardMaterial;
}) {
  return (
    <mesh
      position={[position[0], Y_DIRT_FEATURE, position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
    >
      <circleGeometry args={[BASE_CUT_R, 32]} />
    </mesh>
  );
}

function HomePlateArea({ material }: { material: MeshStandardMaterial }) {
  return (
    <mesh
      position={[0, Y_DIRT_FEATURE, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
    >
      <circleGeometry args={[HOME_AREA_R, 48]} />
    </mesh>
  );
}

function MoundDirt({ material }: { material: MeshStandardMaterial }) {
  return (
    <mesh
      position={[0, Y_DIRT_FEATURE, -PLATE_TO_MOUND]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
    >
      <circleGeometry args={[MOUND_R, 32]} />
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
  // Foul lines terminate exactly at the bowl wall for their bearing.
  // The bowl radius now varies by angle (BACKSTOP behind home plate,
  // OUTFIELD in deep center), so the foul-pole distance is shorter
  // than the deep-center wall. Pulling wallRadiusAtAngle keeps the
  // foul line and the wall meeting cleanly without a visible gap or
  // overshoot if the bowl shape is tweaked later.
  const foulFirstAngle = -Math.PI / 4; // 1B foul line direction in atan2(z,x)
  const foulThirdAngle = (-3 * Math.PI) / 4; // 3B foul line direction
  const firstExtent = wallRadiusAtAngle(foulFirstAngle);
  const thirdExtent = wallRadiusAtAngle(foulThirdAngle);
  const firstLine: Array<[number, number, number]> = [
    [0, Y_LINE, 0],
    [
      firstExtent * Math.cos(foulFirstAngle),
      Y_LINE,
      firstExtent * Math.sin(foulFirstAngle),
    ],
  ];
  const thirdLine: Array<[number, number, number]> = [
    [0, Y_LINE, 0],
    [
      thirdExtent * Math.cos(foulThirdAngle),
      Y_LINE,
      thirdExtent * Math.sin(foulThirdAngle),
    ],
  ];
  // renderOrder pulls these in with the rest of the field — same fix
  // as the grass: transparent objects sort by centroid distance, so
  // foul lines were occasionally drawn after pitch ribbons and masked
  // them at certain camera angles.
  return (
    <>
      <Line points={firstLine} color={LINE} lineWidth={2} transparent opacity={0.9} renderOrder={-1} />
      <Line points={thirdLine} color={LINE} lineWidth={2} transparent opacity={0.9} renderOrder={-1} />
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

