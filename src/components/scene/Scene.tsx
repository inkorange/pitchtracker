"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, type ReactNode } from "react";
import { Stage } from "./Stage";
import { Lighting } from "./Lighting";
import { CameraRig } from "./CameraRig";
import { SkyDome } from "./SkyDome";
import type {
  CameraPosition,
  CameraPreset,
} from "@/lib/viz/camera-presets";

interface SceneProps {
  preset: CameraPreset;
  presetTick?: number;
  // Optional override for the active preset's position/target.
  // Used by the at-bat replay to angle the front camera based on
  // batter handedness; pass through to CameraRig.
  presetOverride?: CameraPosition | null;
  children: ReactNode;
  onPointerMissed?: () => void;
}

export function Scene({
  preset,
  presetTick,
  presetOverride,
  children,
  onPointerMissed,
}: SceneProps) {
  return (
    <Canvas
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 2]}
      style={{ background: "#7ea7c8" }}
      camera={{ fov: 45, near: 0.02, far: 2500 }}
      onPointerMissed={onPointerMissed}
    >
      <Suspense fallback={null}>
        <SkyDome />
        <Lighting />
        <Stage />
        <CameraRig
          preset={preset}
          presetTick={presetTick}
          presetOverride={presetOverride}
        />
        {children}
      </Suspense>
    </Canvas>
  );
}
