"use client";

import {
  Component,
  Suspense,
  useMemo,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useGLTF, useTexture } from "@react-three/drei";
import {
  Box3,
  Color,
  DoubleSide,
  Mesh,
  MeshDepthMaterial,
  RGBADepthPacking,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";

// Silhouette of the batter standing in the box, mirrored by
// handedness. RHB stands at −x (third-base box), LHB at +x (first-base
// box). Shape comes from public/batter.png — luminance × alpha is the
// silhouette mask in the shader. Fixed orientation (turned ~110° so the
// figure faces the pitcher with a slight diagonal toward the camera),
// with a single rotated plane so the figure has visible thickness from
// the standard front-of-plate camera angles.
export function BatterSilhouette({ stand }: { stand: "L" | "R" }) {
  const xOffset = stand === "R" ? -2.2 : 2.2;
  const zOffset = 0.3;
  const texture = useTexture("/batter.png");

  const material = useMemo(() => {
    texture.colorSpace = SRGBColorSpace;
    return new ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uColor: { value: new Color("#101418") },
        uOpacity: { value: 0.55 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          float lum = max(t.r, max(t.g, t.b));
          float a = (1.0 - lum) * t.a;
          if (a < 0.3) discard;
          gl_FragColor = vec4(uColor, uOpacity);
        }
      `,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    });
  }, [texture]);

  // Source image aspect (1196 × 1920 ≈ 0.62) at MLB-typical batter
  // height of ~6.2 ft (helmet included).
  const height = 6.2;
  const width = height * (1196 / 1920);
  // LH batter mirrors the texture so the bat ends up on the correct
  // shoulder, and the rotation flips sign so each handedness opens
  // toward the pitcher symmetrically.
  const flipX = stand === "L" ? -1 : 1;
  const rotationY = (stand === "R" ? -110 : 110) * (Math.PI / 180);

  return (
    <group position={[xOffset, height / 2, zOffset]} rotation={[0, rotationY, 0]}>
      <mesh scale={[flipX, 1, 1]}>
        <planeGeometry args={[width, height]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
}

// Front-preset camera shift based on batter handedness. Camera moves
// toward the SAME side of the plate as the batter, so when the camera
// looks back at the plate the strike zone is offset to the screen
// side OPPOSITE the batter (RHB at −x → camera at −x → plate appears
// to the right of center; LHB mirrors). Returns null when the active
// preset isn't "front" or stance is unknown.
export function frontPresetForStand(
  preset: string,
  stand: "L" | "R" | null,
): { position: [number, number, number]; target: [number, number, number] } | null {
  if (preset !== "front" || !stand) return null;
  const cameraX = stand === "L" ? 0.8 : -0.8;
  return {
    position: [cameraX, 3.9, 10],
    target: [0, 2.8, -20],
  };
}

// =====================================================================
// 3D batter model
//
// Loads a static GLB from /models/batter.glb and renders it at the
// plate, mirrored for LHB. Until the file is dropped in /public/models,
// the <Batter /> wrapper below falls back to the silhouette above.
//
// File spec for /public/models/batter.glb:
//   - format:    .glb (single-file glTF binary)
//   - license:   must permit commercial use
//   - pose:      batting stance preferred; T-pose works as a stop-gap
//   - facing:    +Z (toward catcher) is the assumed forward direction;
//                we rotate so the body opens toward the pitcher
//   - scale:     anything — we auto-normalize to BATTER_HEIGHT_FT (6.2)
//   - polycount: <50k tris recommended (mobile-friendly)
//   - materials: PBR baked into the GLB; no external textures
//
// Free sources:
//   - Adobe Mixamo (https://www.mixamo.com)  — sign in, pick a
//     character, download as glTF (.glb). No animation needed.
//   - Sketchfab CC-BY / CC0 models (verify license per asset).
//   - Quaternius free character packs (https://quaternius.com).
// =====================================================================

const BATTER_MODEL_URL = "/models/batter.glb";
const BATTER_HEIGHT_FT = 5.27;
// Vertical nudge applied after the auto bounding-box "feet on
// ground" math. Positive raises the figure (use when the model's
// bounding box undershoots the visible feet position).
const BATTER_GROUND_LIFT_FT = 0.25;
// Hologram material tint + opacity. Swap to white or another color
// to restyle. Emissive tint at low intensity gives the glowing
// "scout-mode" feel without washing out the figure.
const BATTER_HOLOGRAM_COLOR = "#5fc7d8";
const BATTER_HOLOGRAM_OPACITY = 0.5;
const BATTER_HOLOGRAM_EMISSIVE_INTENSITY = 0.35;
// Y rotation per stance — RHB stands on the third-base side facing
// the pitcher; LHB mirrors via scale.x = -1 on the outer group.
//
// The two stances need INDEPENDENT rotations because a sign-flipped
// scale composes with rotation in non-obvious ways (the model's
// internal node transforms from Tripo3D add another layer the math
// doesn't predict cleanly). Easier to just dial each in by eye.
//
// Adjust these constants if the figure faces the wrong direction.
const BATTER_BASE_ROT_DEG = 90;

function BatterModel({ stand }: { stand: "L" | "R" }) {
  const gltf = useGLTF(BATTER_MODEL_URL);

  // useGLTF caches the scene globally — clone so two BatterModel
  // instances in the same frame don't share state when we set scale
  // / material props below.
  const clone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  // Auto-normalize: compute the model's bounding box, derive a uniform
  // scale that maps its height to BATTER_HEIGHT_FT, and figure out the
  // feet-on-ground offset (the model's local origin may sit at its
  // hips or anywhere else — we want feet at y=0 after scaling).
  const { scale, feetOffsetY } = useMemo(() => {
    const box = new Box3().setFromObject(clone);
    const size = new Vector3();
    box.getSize(size);
    const s = size.y > 0 ? BATTER_HEIGHT_FT / size.y : 1;
    return { scale: s, feetOffsetY: -box.min.y * s };
  }, [clone]);

  // Material override — restyle every mesh as a translucent cyan
  // hologram. Mutates in place so two BatterModel instances sharing
  // a clone (rare but possible) don't fight; the props we touch are
  // safe to mutate per call. DoubleSide also forced here for the
  // LHB mirror. Also opts each mesh into castShadow so the batter
  // silhouette projects onto the ground; alphaTest is set on each
  // material so the shadow-map depth pass reads the model as opaque
  // (with plain transparency the shadow would be extremely faint).
  useMemo(() => {
    const tint = new Color(BATTER_HOLOGRAM_COLOR);
    // Dedicated depth material for the shadow-map pass. The visible
    // material is transparent (opacity 0.5) with alphaTest set, which
    // three.js's auto-generated shadow depth material handles unevenly
    // — the resulting shadow is either extremely faint or missing
    // entirely. Assigning our own opaque MeshDepthMaterial forces the
    // shadow pass to render the model as a fully solid silhouette so
    // the ground shadow is crisp regardless of the hologram alpha.
    // RGBADepthPacking is required because three.js's WebGL shadow
    // maps pack depth into RGBA channels; using the wrong packing
    // produces garbled shadows.
    const shadowDepth = new MeshDepthMaterial({
      depthPacking: RGBADepthPacking,
    });
    clone.traverse((obj) => {
      if (!(obj instanceof Mesh) || !obj.material) return;
      obj.castShadow = true;
      obj.receiveShadow = false;
      obj.customDepthMaterial = shadowDepth;
      const restyle = (mat: typeof obj.material) => {
        if (Array.isArray(mat)) return;
        mat.side = DoubleSide;
        mat.transparent = true;
        mat.opacity = BATTER_HOLOGRAM_OPACITY;
        // depthWrite: true so front-facing polygons occlude BACK-facing
        // polygons of the same mesh. Without this, transparent
        // fragments blend through each other and you see the head
        // through the arm, hips through the bat, etc. With depthWrite
        // on, each face of the model appears solid; the OVERALL object
        // still fades against the background (transparent + opacity),
        // matching the user's ask ("entire surface opaque, but entire
        // object has an opacity").
        mat.depthWrite = true;
        // The default GLTF materials are MeshStandardMaterial-like
        // with color + emissive props. Set both to the hologram tint
        // so the figure reads as a glowing wireframe ghost rather
        // than a dark silhouette.
        const anyMat = mat as unknown as {
          color?: Color;
          emissive?: Color;
          emissiveIntensity?: number;
          metalness?: number;
          roughness?: number;
        };
        if (anyMat.color) anyMat.color.copy(tint);
        if (anyMat.emissive) anyMat.emissive.copy(tint);
        if (anyMat.emissiveIntensity !== undefined) {
          anyMat.emissiveIntensity = BATTER_HOLOGRAM_EMISSIVE_INTENSITY;
        }
        if (anyMat.metalness !== undefined) anyMat.metalness = 0.1;
        if (anyMat.roughness !== undefined) anyMat.roughness = 0.4;
        // alphaTest > 0 forces the shadow depth pass to accept
        // fragments as either fully opaque or fully absent, so the
        // hologram's opacity=0.3 no longer produces a nearly-invisible
        // shadow. Low value keeps the visible fringe smooth.
        const alphaMat = mat as unknown as { alphaTest?: number };
        alphaMat.alphaTest = 0.01;
      };
      if (Array.isArray(obj.material)) {
        for (const mat of obj.material) restyle(mat);
      } else {
        restyle(obj.material);
      }
    });
  }, [clone]);

  const xOffset = stand === "R" ? -2.2 : 2.2;
  const zOffset = 0.3;
  // The Tripo3D-exported GLB comes out mirrored on its X axis, so
  // BOTH stances apply scaleX = -1 just to get to a correct RHB pose.
  // LHB then additionally mirrors Z to flip left/right — bat moves to
  // the opposite shoulder. Both still use the same 90° Y rotation.
  // (See /dev/batter-mirror-test for the variant grid that established
  // this — B = RHB, F = LHB.)
  const flipZ = stand === "L" ? -1 : 1;
  const rotationY = (BATTER_BASE_ROT_DEG * Math.PI) / 180;

  return (
    <group
      position={[xOffset, feetOffsetY + BATTER_GROUND_LIFT_FT, zOffset]}
      rotation={[0, rotationY, 0]}
      scale={[-scale, scale, flipZ * scale]}
    >
      <primitive object={clone} />
    </group>
  );
}

// Preload as soon as the module is imported so the GLB starts
// fetching before the first scene render. 404s here are silent —
// they surface as an error in BatterModel's render, which the
// boundary below catches.
useGLTF.preload(BATTER_MODEL_URL);

// React 16+ error boundaries still have to be class components.
// Catches GLB load failures (file missing, parse error, network
// issue) and surfaces the silhouette fallback in their place.
class GlbErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Silent fallback to silhouette — no console noise needed for
    // the "GLB not added yet" case.
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/**
 * Drop-in batter for both /pitcher and /at-bat scenes. Renders the
 * GLB model when /models/batter.glb is available; falls back to the
 * existing silhouette when it's missing or fails to load.
 */
export function Batter({ stand }: { stand: "L" | "R" }) {
  const fallback = <BatterSilhouette stand={stand} />;
  return (
    <GlbErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <BatterModel stand={stand} />
      </Suspense>
    </GlbErrorBoundary>
  );
}
