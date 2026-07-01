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
        {/* Depth-of-field: crisp focus across the mound → strike zone
            action, soft blur only on truly distant geometry (stadium
            back rows, sky dome). focusDistance is fraction-of-far-
            plane (near .02 → far 2500), so ~0.06 places the focal
            plane ~150 ft from the camera — well past the plate area
            but ahead of the ~300-ft outfield wall. focalLength widens
            the sharp band around that plane so ribbons at any AB
            preset stay crisp. bokehScale kept moderate so the
            stadium reads as 'out of focus in the distance' rather
            than smeared. multisampling=0 lets the postprocessing
            pipeline do its own MSAA on the effect-composed buffer. */}
        <EffectComposer multisampling={0}>
          {/* focusDistance kept at 0.06 — same focal plane, user
              confirmed the point-of-focus was right. focalLength
              tightened (0.15 → 0.10) so the in-focus band around the
              mound/plate is narrower; combined with the bigger
              bokehScale (3 → 7) this makes anything past the focal
              band blur more aggressively as it gets farther out.
              Distant stadium rows and sky dome now read as strongly
              out-of-focus while the pitcher/batter stay crisp. */}
          <DepthOfField
            focusDistance={0.06}
            focalLength={0.10}
            bokehScale={7}
          />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}
