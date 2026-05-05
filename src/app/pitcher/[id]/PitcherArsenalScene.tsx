"use client";

import { useMemo, useState } from "react";
import { Pitch, type StatcastRow } from "@/lib/pitch/Pitch";
import { Scene } from "@/components/scene/Scene";
import { Ribbon } from "@/components/ribbon/Ribbon";
import { CameraPad } from "@/components/controls/CameraPad";
import type { CameraPreset } from "@/lib/viz/camera-presets";

interface CachedPitch {
  game_pk: number;
  at_bat_number: number;
  pitch_number: number;
  pitch_type: string | null;
  pitch_name: string | null;
  release_pos_x: number | null;
  release_pos_y: number | null;
  release_pos_z: number | null;
  vx0: number | null;
  vy0: number | null;
  vz0: number | null;
  ax: number | null;
  ay: number | null;
  az: number | null;
  plate_x: number | null;
  plate_z: number | null;
  release_speed: number | null;
  release_spin_rate: number | null;
  spin_axis: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
}

interface PitcherArsenalSceneProps {
  pitches: CachedPitch[];
}

export function PitcherArsenalScene({ pitches }: PitcherArsenalSceneProps) {
  const [preset, setPreset] = useState<CameraPreset>("side");

  const ribbons = useMemo(() => {
    return pitches
      .map((p) => {
        if (
          p.release_pos_x == null ||
          p.release_pos_y == null ||
          p.release_pos_z == null ||
          p.vx0 == null ||
          p.vy0 == null ||
          p.vz0 == null ||
          p.ax == null ||
          p.ay == null ||
          p.az == null
        ) {
          return null;
        }
        const row: StatcastRow = {
          release_pos_x: p.release_pos_x,
          release_pos_y: p.release_pos_y,
          release_pos_z: p.release_pos_z,
          vx0: p.vx0,
          vy0: p.vy0,
          vz0: p.vz0,
          ax: p.ax,
          ay: p.ay,
          az: p.az,
          plate_x: p.plate_x ?? 0,
          plate_z: p.plate_z ?? 0,
          release_speed: p.release_speed ?? 0,
          release_spin_rate: p.release_spin_rate ?? undefined,
          spin_axis: p.spin_axis ?? undefined,
          pfx_x: p.pfx_x ?? undefined,
          pfx_z: p.pfx_z ?? undefined,
          pitch_type: p.pitch_type ?? "UN",
          pitch_name: p.pitch_name ?? undefined,
        };
        try {
          const pitch = new Pitch(row);
          return {
            id: `${p.game_pk}-${p.at_bat_number}-${p.pitch_number}`,
            path: pitch.path(40),
            pitchType: row.pitch_type,
          };
        } catch {
          return null;
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [pitches]);

  return (
    <>
      <Scene preset={preset}>
        {ribbons.map((r) => (
          <Ribbon key={r.id} path={r.path} pitchType={r.pitchType} radius={0.06} />
        ))}
      </Scene>
      <CameraPad current={preset} onChange={setPreset} />
    </>
  );
}
