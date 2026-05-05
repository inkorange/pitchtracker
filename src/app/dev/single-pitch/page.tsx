"use client";

import { useMemo, useState } from "react";
import { Pitch, type StatcastRow } from "@/lib/pitch/Pitch";
import { Scene } from "@/components/scene/Scene";
import { Ribbon } from "@/components/ribbon/Ribbon";
import { BallTracer } from "@/components/ribbon/BallTracer";
import { CameraPad } from "@/components/controls/CameraPad";
import { TransportBar } from "@/components/controls/TransportBar";
import { getPitchLabel } from "@/lib/viz/colors";
import type { CameraPreset } from "@/lib/viz/camera-presets";

const SKUBAL_FASTBALL: StatcastRow = {
  release_pos_x: 1.36,
  release_pos_y: 54.7,
  release_pos_z: 6.21,
  vx0: -3.55,
  vy0: -141.6,
  vz0: -7.44,
  ax: 4.97,
  ay: 28.4,
  az: -16.1,
  plate_x: 0.05,
  plate_z: 3.18,
  release_speed: 97.2,
  pitch_type: "FF",
  pitch_name: "4-Seam Fastball",
  pfx_x: -0.81,
  pfx_z: 1.49,
};

export default function SinglePitchDev() {
  const [preset, setPreset] = useState<CameraPreset>("side");
  const [progress, setProgress] = useState(0);

  const pitch = useMemo(() => new Pitch(SKUBAL_FASTBALL), []);
  const path = useMemo(() => pitch.path(60), [pitch]);
  const flightDuration = useMemo(() => pitch.flightDuration(), [pitch]);

  return (
    <main className="w-screen h-screen relative bg-[#0a0e14] overflow-hidden">
      <Scene preset={preset}>
        <Ribbon path={path} pitchType={SKUBAL_FASTBALL.pitch_type} />
        <BallTracer path={path} progress={progress} />
      </Scene>
      <div className="absolute top-6 left-6 px-4 py-3 rounded-lg bg-white/[0.06] backdrop-blur-md border border-white/10 shadow-lg">
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">Dev fixture</div>
        <div className="text-sm text-white/95 font-medium mt-0.5">
          Skubal · {getPitchLabel(SKUBAL_FASTBALL.pitch_type)}
        </div>
        <div className="text-xs text-white/60 mt-0.5 tabular-nums">
          {SKUBAL_FASTBALL.release_speed.toFixed(1)} mph
        </div>
      </div>
      <TransportBar flightDuration={flightDuration} onProgressChange={setProgress} />
      <CameraPad current={preset} onChange={setPreset} />
    </main>
  );
}
