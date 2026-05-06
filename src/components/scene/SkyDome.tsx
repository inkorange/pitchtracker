"use client";

import { useMemo } from "react";
import { Sky, Cloud, Clouds } from "@react-three/drei";
import * as THREE from "three";

// drei's <Sky> is a Preetham atmospheric scattering shader rendered on a
// huge sphere; it stays at infinity behind everything else. We pair it
// with a handful of <Cloud> billboards drifting in mid-air so the field
// no longer sits in a black void.
//
// Cloud positions are kept high (y ≥ 60 ft) and well outside the pitch
// envelope so they never clip into ribbons or trajectories.
export function SkyDome() {
  // Material/seed handles aren't truly stable across HMR; useMemo keeps
  // the cloud positions stable across re-renders within a session.
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
      <Sky
        distance={450000}
        // sunPosition controls warmth. A late-afternoon sun sitting 40°
        // up and to the right paints the field in slightly warm tones
        // without going full sunset.
        sunPosition={[80, 90, 60]}
        turbidity={6}
        rayleigh={2.2}
        mieCoefficient={0.005}
        mieDirectionalG={0.7}
      />
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
