"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef, type ComponentRef } from "react";
import { Vector3 } from "three";
import { CAMERA_PRESETS, type CameraPreset } from "@/lib/viz/camera-presets";

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

interface CameraRigProps {
  preset: CameraPreset;
}

export function CameraRig({ preset }: CameraRigProps) {
  const { camera } = useThree();
  const orbitRef = useRef<OrbitControlsImpl>(null);
  const targetPos = useRef(new Vector3());
  const targetLook = useRef(new Vector3());
  const animatingRef = useRef(false);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    const p = CAMERA_PRESETS[preset];
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
  }, [preset, camera]);

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
    if (!animatingRef.current) return;
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
      // Dampen the wheel/pinch zoom so a single scroll doesn't fly the
      // camera across the scene (default zoomSpeed is 1.0).
      zoomSpeed={0.4}
      // Constrain orbit to top and sides — never below the horizon. Keeps the
      // ground plane and stadium silhouette from clipping other objects when
      // the camera tries to look up from underneath.
      maxPolarAngle={Math.PI / 2 - 0.05}
      makeDefault
    />
  );
}
