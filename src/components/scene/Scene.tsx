"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useSyncExternalStore, type ReactNode } from "react";
import { EffectComposer, DepthOfField } from "@react-three/postprocessing";
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
      frameloop={pageActive ? "always" : "never"}
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
        {/* Depth-of-field: crisp near-camera focus (the mound → strike
            zone action) with a soft blur on distant geometry (stadium
            tiers, sky). Focus distance sits at ~1% of the far plane
            (near.02 → far 2500), which lands ~25 ft from the camera —
            comfortably covering the ~5–60 ft range where the ribbons
            live from any of the preset camera positions. bokehScale
            is intentionally moderate so the stadium reads as "out of
            focus in the distance" without smearing into abstract
            blobs. multisampling=0 lets the postprocessing pipeline do
            its own MSAA on the effect-composed buffer. */}
        <EffectComposer multisampling={0}>
          <DepthOfField
            focusDistance={0.012}
            focalLength={0.04}
            bokehScale={3}
          />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}
