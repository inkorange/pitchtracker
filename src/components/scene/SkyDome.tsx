"use client";

import { useMemo } from "react";
import { Cloud, Clouds } from "@react-three/drei";
import * as THREE from "three";

// drei's <Sky> is the Preetham scattering shader — looks great in
// theory but its HDR output gets crushed to near-white by the
// renderer's default ACES tone mapping. A plain inverted sphere with a
// vertical gradient texture is way more predictable: deep blue at the
// zenith fading to a hazy near-horizon. We pair it with a few <Cloud>
// billboards drifting up high so the field doesn't sit in a void.
//
// Cloud positions are kept high (y ≥ 60 ft) and well outside the pitch
// envelope so they never clip into ribbons or trajectories.
export function SkyDome() {
  const skyTexture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, "#1e5fa8"); // zenith — deep daylight blue
    grad.addColorStop(0.5, "#5e9ed1"); // mid sky
    grad.addColorStop(0.85, "#a9c8e2"); // upper horizon haze
    grad.addColorStop(1.0, "#cdd9e3"); // horizon — pale grey-blue
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, []);

  const seeds = useMemo(
    () => [
      { x: 120, y: 70, z: -350, speed: 0.12, volume: 18, segments: 24, opacity: 0.95 },
      { x: -160, y: 90, z: -260, speed: 0.08, volume: 22, segments: 28, opacity: 0.9 },
      { x: 60, y: 110, z: -480, speed: 0.05, volume: 28, segments: 28, opacity: 0.85 },
      { x: -80, y: 65, z: 180, speed: 0.1, volume: 14, segments: 20, opacity: 0.95 },
      { x: 200, y: 80, z: 80, speed: 0.07, volume: 16, segments: 22, opacity: 0.9 },
      { x: 0, y: 130, z: -120, speed: 0.04, volume: 30, segments: 30, opacity: 0.8 },
    ],
    [],
  );

  return (
    <>
      {skyTexture && (
        <mesh scale={[-1, 1, 1]}>
          <sphereGeometry args={[1000, 32, 16]} />
          <meshBasicMaterial
            map={skyTexture}
            side={THREE.BackSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      <Clouds material={THREE.MeshBasicMaterial}>
        {seeds.map((s, i) => (
          <Cloud
            key={i}
            position={[s.x, s.y, s.z]}
            speed={s.speed}
            segments={s.segments}
            bounds={[s.volume, s.volume * 0.4, s.volume * 0.6]}
            volume={s.volume}
            opacity={s.opacity}
            color="#ffffff"
          />
        ))}
      </Clouds>
    </>
  );
}
