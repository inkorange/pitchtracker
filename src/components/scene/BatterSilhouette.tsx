"use client";

import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { Color, DoubleSide, ShaderMaterial, SRGBColorSpace } from "three";

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
