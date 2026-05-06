"use client";

import { useMemo } from "react";
import { Sphere } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
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
  selectedIndex?: number | null;
  // When something is selected, non-selected dots dim further.
  hasSelection?: boolean;
  onSelect?: (index: number) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
}

// Renders a small colored dot at each pitch's plate location, colored
// by outcome. Plate locations are ALWAYS anchored at home plate — both
// pitchers' spray charts overlay on the same strike zone regardless of
// any release-point normalization, since the strike zone is what
// matters for the outcome.
export function OutcomeMarkers({
  pitches,
  opacity = 1,
  selectedIndex = null,
  hasSelection = false,
  onSelect,
  onPointerOver,
  onPointerOut,
}: OutcomeMarkersProps) {
  const markers = useMemo(
    () =>
      pitches
        .map((p, i) => {
          if (p.plate_x == null || p.plate_z == null) return null;
          const tw = statcastToThree([p.plate_x, 0, p.plate_z]);
          return {
            id: i,
            position: tw,
            color: getOutcomeColor(p.description),
          };
        })
        .filter((m): m is { id: number; position: [number, number, number]; color: string } => m !== null),
    [pitches],
  );

  return (
    <>
      {markers.map((m) => {
        const isSelected = selectedIndex === m.id;
        // Dimming layers: side-hover opacity × per-dot focus when something
        // is selected. Selected dot stays at full strength regardless.
        const focusOpacity = !hasSelection || isSelected ? 1 : 0.25;
        const finalOpacity = opacity * focusOpacity;
        const radius = isSelected ? 0.18 : 0.12;
        return (
          <Sphere
            key={m.id}
            args={[radius, 16, 16]}
            position={m.position}
            onPointerOver={(e) => {
              if (onSelect) {
                e.stopPropagation();
                document.body.style.cursor = "pointer";
              }
              onPointerOver?.(e);
            }}
            onPointerOut={(e) => {
              if (onSelect) document.body.style.cursor = "";
              onPointerOut?.(e);
            }}
            onClick={(e) => {
              if (!onSelect) return;
              e.stopPropagation();
              onSelect(m.id);
            }}
          >
            <meshStandardMaterial
              color={m.color}
              roughness={0.4}
              metalness={0.05}
              transparent
              opacity={finalOpacity}
              emissive={isSelected ? m.color : "#000000"}
              emissiveIntensity={isSelected ? 0.6 : 0}
            />
          </Sphere>
        );
      })}
    </>
  );
}
