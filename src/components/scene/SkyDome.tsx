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
      {/* Multiplier pulls red/green further down (~0.55/0.70) while
          holding blue (~0.88), shifting the rendered sky toward a
          deeper saturated daytime blue without darkening the clouds
          to the point that they grey out. */}
      <meshBasicMaterial
        map={skyTexture}
        color="#8eb4e0"
        side={THREE.BackSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
