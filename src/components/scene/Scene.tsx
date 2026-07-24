"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useSyncExternalStore, type ReactNode } from "react";
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
  // Force the render loop on regardless of tab focus / visibility.
  // Automated screenshots (headless browsers, and background or
  // unfocused tabs) report no focus, which drops the frameloop to
  // "never" below and leaves the WebGL canvas blank or frozen on its
  // first frame. Screenshot mode (`?shot=hero`) sets this so the scene
  // reliably renders for capture.
  forceRender?: boolean;
  children: ReactNode;
  onPointerMissed?: () => void;
}

// Document visibility / window focus subscription, used to pause the
// frameloop when the user backgrounds the tab or locks their phone.
// Mobile browsers usually throttle hidden tabs but the throttling
// isn't reliable in our experience — an idle 60fps WebGL canvas left
// open for a long time can drain battery and accumulate GPU memory
// pressure until the OS kills the tab. Explicitly switching to
// `frameloop="never"` is the safer floor.
function subscribePageActive(callback: () => void): () => void {
  const onVisibility = () => callback();
  const onBlur = () => callback();
  const onFocus = () => callback();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
  };
}
function getPageActiveSnapshot(): boolean {
  // `hasFocus` returns false when another tab/window is focused even
  // if the document is visible (e.g. side-by-side windows). Combine
  // with !document.hidden so we keep rendering when the document is
  // visible but the focus is in DevTools.
  return !document.hidden && (document.hasFocus() || document.visibilityState === "visible");
}
function getPageActiveServerSnapshot(): boolean {
  return true;
}

export function Scene({
  preset,
  presetTick,
  presetOverride,
  forceRender = false,
  children,
  onPointerMissed,
}: SceneProps) {
  const pageActive = useSyncExternalStore(
    subscribePageActive,
    getPageActiveSnapshot,
    getPageActiveServerSnapshot,
  );
  return (
    <Canvas
      frameloop={forceRender || pageActive ? "always" : "never"}
      // shadows enables the shadow-map pass; individual lights and
      // meshes still opt in via castShadow / receiveShadow. Off
      // globally would skip the pass entirely and save perf; on
      // means we pay the cost only for lights/meshes that request it.
      shadows
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
