"use client";

import { useMemo, useState } from "react";
import { Scene } from "@/components/scene/Scene";
import { Ribbon } from "@/components/ribbon/Ribbon";
import { CameraPad } from "@/components/controls/CameraPad";
import { averagePitchesByType, type CachedPitchSubset } from "@/lib/pitch/averages";
import type { CameraPreset } from "@/lib/viz/camera-presets";

interface ComparisonSceneProps {
  aPitches: CachedPitchSubset[];
  bPitches: CachedPitchSubset[];
}

export function ComparisonScene({ aPitches, bPitches }: ComparisonSceneProps) {
  const [preset, setPreset] = useState<CameraPreset>("side");
  const [presetTick, setPresetTick] = useState(0);
  const handlePresetChange = (next: CameraPreset) => {
    setPreset(next);
    setPresetTick((t) => t + 1);
  };

  // One bold average ribbon per pitch type per pitcher.
  const aRibbons = useMemo(() => buildRibbons(aPitches), [aPitches]);
  const bRibbons = useMemo(() => buildRibbons(bPitches), [bPitches]);

  return (
    <>
      <Scene preset={preset} presetTick={presetTick}>
        {aRibbons.map((r) => (
          <Ribbon
            key={`a-${r.pitchType}`}
            path={r.path}
            pitchType={r.pitchType}
            radius={0.1}
            side="a"
          />
        ))}
        {bRibbons.map((r) => (
          <Ribbon
            key={`b-${r.pitchType}`}
            path={r.path}
            pitchType={r.pitchType}
            radius={0.1}
            side="b"
          />
        ))}
      </Scene>
      <CameraPad current={preset} onChange={handlePresetChange} />
    </>
  );
}

function buildRibbons(pitches: CachedPitchSubset[]) {
  const byType = averagePitchesByType(pitches);
  const out: Array<{ pitchType: string; path: Array<[number, number, number]> }> = [];
  for (const [pitchType, pitch] of byType) {
    try {
      out.push({ pitchType, path: pitch.path(48) });
    } catch {
      // skip pitches with malformed math
    }
  }
  return out;
}
