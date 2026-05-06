"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, type ReactNode } from "react";
import { Stage } from "./Stage";
import { Lighting } from "./Lighting";
import { CameraRig } from "./CameraRig";
import { SkyDome } from "./SkyDome";
import type { CameraPreset } from "@/lib/viz/camera-presets";

interface SceneProps {
  preset: CameraPreset;
  presetTick?: number;
  children: ReactNode;
  onPointerMissed?: () => void;
}

export function Scene({ preset, presetTick, children, onPointerMissed }: SceneProps) {
  return (
    <Canvas
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 2]}
      style={{ background: "#7ea7c8" }}
      camera={{ fov: 45, near: 0.1, far: 1500 }}
      onPointerMissed={onPointerMissed}
    >
      <Suspense fallback={null}>
        <SkyDome />
        <Lighting />
        <Stage />
        <CameraRig preset={preset} presetTick={presetTick} />
        {children}
      </Suspense>
    </Canvas>
  );
}
