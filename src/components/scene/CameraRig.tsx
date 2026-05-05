"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { CAMERA_PRESETS, type CameraPreset } from "@/lib/viz/camera-presets";

interface CameraRigProps {
  preset: CameraPreset;
}

export function CameraRig({ preset }: CameraRigProps) {
  const { camera } = useThree();
  const targetPos = useRef(new Vector3());
  const targetLook = useRef(new Vector3());
  const currentLook = useRef(new Vector3());
  const initialized = useRef(false);

  useEffect(() => {
    const p = CAMERA_PRESETS[preset];
    targetPos.current.set(p.position[0], p.position[1], p.position[2]);
    targetLook.current.set(p.target[0], p.target[1], p.target[2]);
    if (!initialized.current) {
      camera.position.set(p.position[0], p.position[1], p.position[2]);
      currentLook.current.set(p.target[0], p.target[1], p.target[2]);
      initialized.current = true;
    }
  }, [preset, camera]);

  useFrame((_, delta) => {
    // Damped spring-like easing toward the target preset.
    const k = Math.min(1, delta * 2.5);
    camera.position.lerp(targetPos.current, k);
    currentLook.current.lerp(targetLook.current, k);
    camera.lookAt(currentLook.current);
  });

  return null;
}
