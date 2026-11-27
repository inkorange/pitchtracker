"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Scene } from "@/components/scene/Scene";
import { HistoricalPitchLines } from "@/components/ribbon/HistoricalPitchLines";
import { Pitch, type StatcastRow } from "@/lib/pitch/Pitch";
import type { CameraPosition, CameraPreset } from "@/lib/viz/camera-presets";
import type { SlimPitch } from "@/lib/home/feature-shapes";

// Centered behind-the-plate framing for small embedded canvases. The
// pitcher page's `front` preset is biased right to clear its side
// panel; this one isn't.
export const MONITOR_FRONT: CameraPosition = {
  position: [0, 4.3, 13],
  target: [0, 2.5, -55],
};

/**
 * Small, non-interactive 3D scene: every given pitch drawn as one
 * merged line set (a single draw call), fixed camera, no shadows.
 * Load via next/dynamic with ssr:false — WebGL only.
 */
export default function MiniScene({
  pitches,
  paused = false,
  preset = "front",
  presetOverride = MONITOR_FRONT,
  opacity = 0.6,
  onReady,
}: {
  pitches: SlimPitch[];
  paused?: boolean;
  preset?: CameraPreset;
  presetOverride?: CameraPosition | null;
  opacity?: number;
  /** Called once the scene has drawn its first full frame. */
  onReady?: () => void;
}) {
  const entries = useMemo(
    () =>
      pitches.flatMap((p, i) => {
        const row: StatcastRow = {
          release_pos_x: p[0],
          release_pos_y: p[1],
          release_pos_z: p[2],
          vx0: p[3],
          vy0: p[4],
          vz0: p[5],
          ax: p[6],
          ay: p[7],
          az: p[8],
          plate_x: p[9],
          plate_z: p[10],
          release_speed: p[11],
          pitch_type: p[12],
        };
        try {
          return [{ id: String(i), path: new Pitch(row).path(40), pitchType: p[12] }];
        } catch {
          return [];
        }
      }),
    [pitches],
  );

  return (
    <Scene preset={preset} presetOverride={presetOverride} interactive={false} paused={paused} lite>
      <HistoricalPitchLines entries={entries} opacity={opacity} />
      {onReady ? <FirstFrame onReady={onReady} /> : null}
    </Scene>
  );
}

// Scene renders its children inside a Suspense boundary that waits for
// the stage textures, so the first frame this sees is a complete one
// (field, sky and paths) — the right moment to fade the canvas in.
function FirstFrame({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    requestAnimationFrame(() => onReady());
  });
  return null;
}
