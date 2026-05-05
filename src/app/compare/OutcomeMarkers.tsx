"use client";

import { useMemo } from "react";
import { Sphere } from "@react-three/drei";
import { statcastToThree } from "@/lib/viz/coords";
import { getOutcomeColor } from "@/lib/viz/colors";

interface PitchPoint {
  plate_x: number | null;
  plate_z: number | null;
  description?: string | null;
}

interface OutcomeMarkersProps {
  pitches: PitchPoint[];
  opacity?: number;
}

// Renders a small colored dot at each pitch's plate location, colored
// by outcome. Plate locations are ALWAYS anchored at home plate — both
// pitchers' spray charts overlay on the same strike zone regardless of
// any release-point normalization, since the strike zone is what
// matters for the outcome.
export function OutcomeMarkers({ pitches, opacity = 1 }: OutcomeMarkersProps) {
  const markers = useMemo(
    () =>
      pitches
        .filter((p) => p.plate_x != null && p.plate_z != null)
        .map((p, i) => {
          const tw = statcastToThree([p.plate_x ?? 0, 0, p.plate_z ?? 0]);
          return {
            id: i,
            position: tw,
            color: getOutcomeColor(p.description),
          };
        }),
    [pitches],
  );

  const transparent = opacity < 1;

  return (
    <>
      {markers.map((m) => (
        <Sphere key={m.id} args={[0.12, 12, 12]} position={m.position}>
          <meshStandardMaterial
            color={m.color}
            roughness={0.4}
            metalness={0.05}
            transparent={transparent}
            opacity={opacity}
            depthWrite={!transparent}
          />
        </Sphere>
      ))}
    </>
  );
}
