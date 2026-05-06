"use client";

import { useEffect, useMemo, useState } from "react";
import { Html, Sphere } from "@react-three/drei";
import { Pitch, type StatcastRow } from "@/lib/pitch/Pitch";
import { Scene } from "@/components/scene/Scene";
import { Ribbon } from "@/components/ribbon/Ribbon";
import { CameraPad } from "@/components/controls/CameraPad";
import { statcastToThree } from "@/lib/viz/coords";
import { getOutcomeColor, getPitchLabel } from "@/lib/viz/colors";
import type { CameraPreset } from "@/lib/viz/camera-presets";

interface CachedPitch {
  game_pk: number;
  at_bat_number: number;
  pitch_number: number;
  pitch_type: string | null;
  pitch_name: string | null;
  description: string | null;
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
  release_extension: number | null;
}

interface PitcherArsenalSceneProps {
  pitches: CachedPitch[];
  pitcherLabel: string;
}

interface PitchEntry {
  id: string;
  path: Array<[number, number, number]>;
  pitchType: string;
  outcomeColor: string;
  platePosition: [number, number, number] | null;
  source: CachedPitch;
}

export function PitcherArsenalScene({ pitches, pitcherLabel }: PitcherArsenalSceneProps) {
  const [preset, setPreset] = useState<CameraPreset>("side");
  const [presetTick, setPresetTick] = useState(0);
  const handlePresetChange = (next: CameraPreset) => {
    setPreset(next);
    // Bump even when next === preset so the rig retriggers and the user
    // can re-click an active preset to snap back after orbiting away.
    setPresetTick((t) => t + 1);
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entries: PitchEntry[] = useMemo(() => {
    return pitches
      .map((p): PitchEntry | null => {
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
          const path = pitch.path(40);
          const platePosition: [number, number, number] | null =
            p.plate_x != null && p.plate_z != null
              ? statcastToThree([p.plate_x, 0, p.plate_z])
              : null;
          return {
            id: `${p.game_pk}-${p.at_bat_number}-${p.pitch_number}`,
            path,
            pitchType: row.pitch_type,
            outcomeColor: getOutcomeColor(p.description),
            platePosition,
            source: p,
          };
        } catch {
          return null;
        }
      })
      .filter((e): e is PitchEntry => e !== null);
  }, [pitches]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const hasSelection = selectedEntry !== null;

  // Left/right arrows cycle through the visible pitches. Skipped when the
  // user is typing in an input (the search box) so the keys still work
  // normally there.
  useEffect(() => {
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (entries.length === 0) return;
      ev.preventDefault();
      const dir = ev.key === "ArrowRight" ? 1 : -1;
      setSelectedId((curr) => {
        const idx = curr ? entries.findIndex((entry) => entry.id === curr) : -1;
        const next =
          idx === -1
            ? dir === 1
              ? 0
              : entries.length - 1
            : (idx + dir + entries.length) % entries.length;
        return entries[next].id;
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [entries]);

  return (
    <>
      <Scene
        preset={preset}
        presetTick={presetTick}
        onPointerMissed={() => setSelectedId(null)}
      >
        {entries.map((e) => {
          const isSelected = selectedEntry?.id === e.id;
          // When something is selected, fade the rest so the focus reads.
          const opacity = !hasSelection || isSelected ? 1 : 0.18;
          return (
            <group key={e.id}>
              <Ribbon
                path={e.path}
                pitchType={e.pitchType}
                radius={isSelected ? 0.1 : 0.06}
                opacity={opacity}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelectedId(e.id);
                }}
              />
              {e.platePosition && (
                <Sphere
                  args={[isSelected ? 0.13 : 0.1, 16, 16]}
                  position={e.platePosition}
                  onPointerOver={(ev) => {
                    ev.stopPropagation();
                    document.body.style.cursor = "pointer";
                  }}
                  onPointerOut={() => {
                    document.body.style.cursor = "";
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setSelectedId(e.id);
                  }}
                >
                  <meshStandardMaterial
                    color={e.outcomeColor}
                    roughness={0.4}
                    metalness={0.05}
                    transparent
                    opacity={opacity}
                    emissive={isSelected ? e.outcomeColor : "#000000"}
                    emissiveIntensity={isSelected ? 0.6 : 0}
                  />
                </Sphere>
              )}
            </group>
          );
        })}
        {selectedEntry && (
          <SelectedLabels entry={selectedEntry} pitcherLabel={pitcherLabel} />
        )}
      </Scene>
      <CameraPad current={preset} onChange={handlePresetChange} />
      {hasSelection && (
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-white/[0.08] hover:bg-white/[0.14] backdrop-blur-md border border-white/15 text-[11px] uppercase tracking-[0.14em] text-white/85 pointer-events-auto"
        >
          Clear selection
        </button>
      )}
    </>
  );
}

function SelectedLabels({
  entry,
  pitcherLabel,
}: {
  entry: PitchEntry;
  pitcherLabel: string;
}) {
  const anchor = statcastToThree(entry.path[entry.path.length - 1]);
  const p = entry.source;
  const rows: Array<{ label: string; value: string }> = [];
  if (p.release_spin_rate != null) {
    rows.push({ label: "Spin", value: `${Math.round(p.release_spin_rate)} rpm` });
  }
  if (p.pfx_z != null) {
    rows.push({ label: "iVB", value: formatBreak(p.pfx_z * 12) });
  }
  if (p.pfx_x != null) {
    rows.push({ label: "HB", value: formatBreak(p.pfx_x * 12) });
  }
  if (p.spin_axis != null) {
    rows.push({ label: "Axis", value: `${Math.round(p.spin_axis)}°` });
  }
  if (p.release_extension != null) {
    rows.push({ label: "Ext", value: `${p.release_extension.toFixed(1)} ft` });
  }
  return (
    <Html position={anchor} zIndexRange={[100, 0]} style={{ pointerEvents: "none" }}>
      <div style={{ position: "relative", width: 0, height: 0 }}>
        <div
          className="absolute whitespace-nowrap px-2 py-1 rounded bg-black/75 backdrop-blur-sm border border-white/15 text-xs text-white/95 tabular-nums shadow-lg"
          style={{ left: 0, top: 0, transform: "translate(12px, -50%)" }}
        >
          <span className="font-medium">{pitcherLabel}</span>
          <span className="text-white/55 ml-1.5">{getPitchLabel(entry.pitchType)}</span>
          {p.release_speed != null && (
            <span className="text-white/70 ml-1.5">
              {Number(p.release_speed).toFixed(1)} mph
            </span>
          )}
        </div>
        {rows.length > 0 && (
          <div
            className="absolute whitespace-nowrap px-2 py-1.5 rounded bg-black/75 backdrop-blur-sm border border-white/15 text-[11px] text-white/95 tabular-nums shadow-lg"
            style={{ right: 0, top: 0, transform: "translate(-12px, -50%)" }}
          >
            <div className="flex flex-col gap-0.5">
              {rows.map((r) => (
                <div key={r.label} className="flex justify-between gap-3">
                  <span className="text-white/55">{r.label}</span>
                  <span>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Html>
  );
}

function formatBreak(inches: number): string {
  const sign = inches >= 0 ? "+" : "";
  return `${sign}${inches.toFixed(1)}"`;
}
