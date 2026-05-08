"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef, type ComponentRef } from "react";
import { Vector3 } from "three";
import {
  CAMERA_PRESETS,
  type CameraPosition,
  type CameraPreset,
} from "@/lib/viz/camera-presets";

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

interface CameraRigProps {
  preset: CameraPreset;
  // Increments each time a preset button is clicked, even if the preset
  // value itself didn't change. Lets the user re-click the active preset
  // to snap back after orbiting away.
  presetTick?: number;
  // Optional preset override: when present, replaces the preset lookup
  // with these explicit position/target values. Used by the at-bat
  // replay to angle the front camera toward the batter side.
  presetOverride?: CameraPosition | null;
}

export function CameraRig({ preset, presetTick = 0, presetOverride }: CameraRigProps) {
  const { camera } = useThree();
  const orbitRef = useRef<OrbitControlsImpl>(null);
  const targetPos = useRef(new Vector3());
  const targetLook = useRef(new Vector3());
  const animatingRef = useRef(false);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    const p = presetOverride ?? CAMERA_PRESETS[preset];
    targetPos.current.set(p.position[0], p.position[1], p.position[2]);
    targetLook.current.set(p.target[0], p.target[1], p.target[2]);
    if (firstRenderRef.current) {
      camera.position.set(p.position[0], p.position[1], p.position[2]);
      if (orbitRef.current) {
        orbitRef.current.target.set(p.target[0], p.target[1], p.target[2]);
        orbitRef.current.update();
      }
      firstRenderRef.current = false;
      animatingRef.current = false;
    } else {
      animatingRef.current = true;
    }
    // presetOverride is included so a memoized override flipping
    // identity (e.g., null → MOBILE_FRONT_PRESET after hydration, or
    // a new at-bat stance override) snaps the camera even if `preset`
    // and `presetTick` haven't changed.
  }, [preset, presetTick, presetOverride, camera]);

  // If the user starts orbiting, cancel any in-flight preset tween so the
  // tween doesn't fight the user's drag.
  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    const cancel = () => {
      animatingRef.current = false;
    };
    controls.addEventListener("start", cancel);
    return () => {
      controls.removeEventListener("start", cancel);
    };
  }, []);

  useFrame((_, delta) => {
    if (animatingRef.current) {
      const k = Math.min(1, delta * 2.5);
      camera.position.lerp(targetPos.current, k);
      if (orbitRef.current) {
        orbitRef.current.target.lerp(targetLook.current, k);
        orbitRef.current.update();
      }
      if (
        camera.position.distanceTo(targetPos.current) < 0.05 &&
        orbitRef.current &&
        orbitRef.current.target.distanceTo(targetLook.current) < 0.05
      ) {
        animatingRef.current = false;
      }
    }

    // Hard floor on camera y. maxPolarAngle alone can't guarantee this
    // when the orbit target sits high (e.g., the strike-zone preset),
    // because polar slightly past π/2 lets the camera sink below ground
    // at long distances.
    if (camera.position.y < 0.3) {
      camera.position.setY(0.3);
    }
  });

  return (
    <OrbitControls
      ref={orbitRef}
      enableDamping
      dampingFactor={0.08}
      minDistance={5}
      // Max zoom-out matches the top preset's camera distance (100 ft).
      // Users can zoom in from any preset, but never further out than the
      // top preset's framing.
      maxDistance={100}
      // Dampen the wheel/pinch zoom further so a single scroll only nudges
      // the camera (default zoomSpeed is 1.0).
      zoomSpeed={0.18}
      // Same idea for orbit drag — default rotateSpeed is 1.0, which
      // felt too twitchy. 0.5 keeps movement responsive without
      // overshooting on small drags.
      rotateSpeed={0.5}
      // Allow ~0.85° below horizontal so the user can angle slightly up
      // from a low vantage point. A useFrame clamp on camera.y keeps the
      // camera from actually sinking under the field plane.
      maxPolarAngle={Math.PI / 2 + 0.015}
      makeDefault
    />
  );
}
