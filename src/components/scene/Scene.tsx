"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, type ReactNode } from "react";
import { Stage } from "./Stage";
import { Lighting } from "./Lighting";
import { CameraRig } from "./CameraRig";
import type { CameraPreset } from "@/lib/viz/camera-presets";

interface SceneProps {
  preset: CameraPreset;
  children: ReactNode;
}

export function Scene({ preset, children }: SceneProps) {
  return (
    <Canvas
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 2]}
      style={{ background: "#0a0e14" }}
      camera={{ fov: 45, near: 0.1, far: 1500 }}
    >
      <Suspense fallback={null}>
        <Lighting />
        <Stage />
        <CameraRig preset={preset} />
        {children}
      </Suspense>
    </Canvas>
  );
}
