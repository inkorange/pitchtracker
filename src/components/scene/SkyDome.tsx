"use client";

import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";

// Inverted sphere with the raw sky panorama texture mapped to its
// inside. No color tint, no shader patches — what you see is the
// uploaded JPG. Anisotropy + mipmaps stay on so the image displays
// smoothly at glancing angles, but they don't alter the pixel content.
export function SkyDome() {
  const skyTexture = useTexture("/sky-map.jpg");
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    skyTexture.anisotropy = gl.capabilities.getMaxAnisotropy();
    skyTexture.minFilter = THREE.LinearMipmapLinearFilter;
    skyTexture.magFilter = THREE.LinearFilter;
    skyTexture.generateMipmaps = true;
    skyTexture.needsUpdate = true;
  }, [skyTexture, gl]);

  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[1500, 64, 32]} />
      {/* Multiplier shifts the texture toward a richer blue: red/green
          channels pulled down to ~0.72/0.78, blue held at ~0.91, so
          the daytime sky reads blue instead of washed out without
          losing the cloud + horizon-haze detail in the texture. */}
      <meshBasicMaterial
        map={skyTexture}
        color="#b8c8e8"
        side={THREE.BackSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
