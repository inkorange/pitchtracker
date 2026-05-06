"use client";

import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

// Inverted sphere with a sky panorama texture mapped to its inside.
// public/sky-map.jpg is a 4:1 horizontal panorama with cumulus clouds in
// the upper band and a hazy horizon at the middle.
//
// The material's `color` is used as a tint multiplier, but a custom
// shader patch only applies it to non-cloud pixels — so the blue sky
// can be pulled toward a deep, saturated daytime blue while clouds
// (high minimum channel value = near-white) keep their authored white.
export function SkyDome() {
  const skyTexture = useTexture("/sky-map.jpg");
  const gl = useThree((s) => s.gl);

  const material = useMemo(() => {
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    // Max anisotropy so glancing-angle samples (toward the horizon) pick
    // the right mip level instead of producing the stair-step / blocky
    // pattern visible at low anisotropy. Linear min/mag filtering with
    // mipmaps gives smooth interpolation at every distance.
    skyTexture.anisotropy = gl.capabilities.getMaxAnisotropy();
    skyTexture.minFilter = THREE.LinearMipmapLinearFilter;
    skyTexture.magFilter = THREE.LinearFilter;
    skyTexture.generateMipmaps = true;
    skyTexture.needsUpdate = true;

    const mat = new THREE.MeshBasicMaterial({
      map: skyTexture,
      color: new THREE.Color("#5e7d96"),
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
    });

    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D(map, vMapUv);
          // cloudMask ≈ 1 for near-white cloud pixels, 0 for blue sky.
          // Threshold on min(r,g,b) since clouds are nearly neutral and
          // blue sky has a low red channel.
          float minC = min(min(sampledDiffuseColor.r, sampledDiffuseColor.g), sampledDiffuseColor.b);
          float cloudMask = smoothstep(0.55, 0.85, minC);
          vec3 tinted = sampledDiffuseColor.rgb * diffuseColor.rgb;
          // Clouds keep their hue but get knocked down so they don't
          // read as burnt-white against the deeper sky.
          vec3 cloudVal = sampledDiffuseColor.rgb * vec3(0.74, 0.78, 0.82);
          diffuseColor.rgb = mix(tinted, cloudVal, cloudMask);
          diffuseColor.a *= sampledDiffuseColor.a;
        #endif
        `,
      );
    };

    return mat;
  }, [skyTexture, gl]);

  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[1500, 64, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
