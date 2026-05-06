"use client";

import { useCallback, useMemo, useState } from "react";
import { Html } from "@react-three/drei";
import { Scene } from "@/components/scene/Scene";
import { Ribbon } from "@/components/ribbon/Ribbon";
import { BallTracer } from "@/components/ribbon/BallTracer";
import { CameraPad } from "@/components/controls/CameraPad";
import { TransportBar } from "@/components/controls/TransportBar";
import {
  averagePitchesByType,
  pitchFromRow,
  type CachedPitchSubset,
} from "@/lib/pitch/averages";
import { computeTunnelStats } from "@/lib/pitch/tunneling";
import type { Pitch } from "@/lib/pitch/Pitch";
import { statcastToThree } from "@/lib/viz/coords";
import type { CameraPreset } from "@/lib/viz/camera-presets";
import { TunnelMarker } from "./TunnelMarker";
import { OutcomeMarkers } from "./OutcomeMarkers";
import { useCompareHover, useOpacityForSide } from "./CompareHoverContext";
import { getPitchColorForSide, type CompareSide } from "@/lib/viz/colors";
import { Sphere } from "@react-three/drei";

interface PitchWithOutcome extends CachedPitchSubset {
  description?: string | null;
}

interface ShapeMetrics {
  spinRpm: number | null;
  spinAxis: number | null;
  pfxXIn: number | null; // horizontal break, inches
  pfxZIn: number | null; // induced vertical break, inches
  extensionFt: number | null;
}

interface ComparisonSceneProps {
  aPitches: PitchWithOutcome[];
  bPitches: PitchWithOutcome[];
  aLabel: string;
  bLabel: string;
  // When true (default), translate both pitchers' paths so they share a
  // common release origin. Lets the user compare pitch SHAPE rather than
  // arm-slot differences. Set false for "true release" mode.
  normalizeRelease?: boolean;
}

interface RibbonData {
  pitchType: string;
  path: Array<[number, number, number]>;
  releaseSpeed: number | null;
}

type Selection =
  | { kind: "pitch"; side: CompareSide; index: number }
  | { kind: "average"; side: CompareSide; pitchType: string };

interface MatchedTunnel {
  pitchType: string;
  markerPos: [number, number, number];
  tunnelY: number;
}

export function ComparisonScene({
  aPitches,
  bPitches,
  aLabel,
  bLabel,
  normalizeRelease = true,
}: ComparisonSceneProps) {
  const [preset, setPreset] = useState<CameraPreset>("side");
  const [presetTick, setPresetTick] = useState(0);
  const handlePresetChange = (next: CameraPreset) => {
    setPreset(next);
    setPresetTick((t) => t + 1);
  };

  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<Selection | null>(null);

  const { aRibbons, bRibbons, tunnels, flightDuration, releaseOffset } = useMemo(() => {
    const aByType = averagePitchesByType(aPitches);
    const bByType = averagePitchesByType(bPitches);

    const aRaw = ribbonsFromMap(aByType);
    const bRaw = ribbonsFromMap(bByType);

    let bRibbons = bRaw;
    let releaseOffset: [number, number, number] = [0, 0, 0];
    if (normalizeRelease) {
      const aRelease = avgFirstPoint(aRaw);
      const bRelease = avgFirstPoint(bRaw);
      if (aRelease && bRelease) {
        // Only align lateral (X) and height (Z). Shifting depth (Y, distance
        // from plate) would push B's plate end off the plate plane, so the
        // ball would render in front of or behind the strike zone instead
        // of at it.
        releaseOffset = [
          aRelease[0] - bRelease[0],
          0,
          aRelease[2] - bRelease[2],
        ];
        bRibbons = bRaw.map((r) => ({
          ...r,
          path: r.path.map(
            (p) =>
              [p[0] + releaseOffset[0], p[1] + releaseOffset[1], p[2] + releaseOffset[2]] as [
                number,
                number,
                number,
              ],
          ),
        }));
      }
    }

    const tunnels: MatchedTunnel[] = [];
    for (const [type, aPitch] of aByType) {
      const bPitch = bByType.get(type);
      if (!bPitch) continue;
      try {
        const stats = computeTunnelStats(aPitch, bPitch, { thresholdFt: 0.5 });
        if (stats.tunnelY == null) continue;
        const markerPos = tunnelMarkerPosition(aPitch, bPitch, stats.tunnelY, releaseOffset);
        tunnels.push({ pitchType: type, markerPos, tunnelY: stats.tunnelY });
      } catch {
        // skip
      }
    }

    // Use the longest flight time among matched pitches as the playback
    // duration — slowest pitch sets the pace so all balls reach the
    // plate around the same time.
    let flightDuration = 0.4;
    for (const p of aByType.values()) {
      flightDuration = Math.max(flightDuration, safeDuration(p));
    }
    for (const p of bByType.values()) {
      flightDuration = Math.max(flightDuration, safeDuration(p));
    }

    return { aRibbons: aRaw, bRibbons, tunnels, flightDuration, releaseOffset };
  }, [aPitches, bPitches, normalizeRelease]);

  // Build the selected ribbon's path + label. Two kinds:
  //   "pitch":   one specific cached pitch — build its path from kinematics
  //   "average": one averaged-by-type ribbon — reuse its already-built path
  // Side B paths in both cases inherit the release-point offset that the
  // averaged B ribbons received, so the selection lines up with its
  // averaged ribbon when normalizeRelease is on.
  const selectedRibbon = useMemo(() => {
    if (!selected) return null;
    const sideRibbons = selected.side === "a" ? aRibbons : bRibbons;
    const label = selected.side === "a" ? aLabel : bLabel;

    if (selected.kind === "pitch") {
      const list = selected.side === "a" ? aPitches : bPitches;
      const row = list[selected.index];
      if (!row) return null;
      const pitch = pitchFromRow(row);
      if (!pitch) return null;
      let path: Array<[number, number, number]>;
      try {
        path = pitch.path(48);
      } catch {
        return null;
      }
      if (selected.side === "b") {
        path = path.map(
          (p) =>
            [
              p[0] + releaseOffset[0],
              p[1] + releaseOffset[1],
              p[2] + releaseOffset[2],
            ] as [number, number, number],
        );
      }
      return {
        pitchType: row.pitch_type ?? "",
        path,
        side: selected.side,
        labelPosition: statcastToThree(path[path.length - 1]),
        label,
        velocity: row.release_speed,
        metrics: {
          spinRpm: row.release_spin_rate ?? null,
          spinAxis: row.spin_axis ?? null,
          pfxXIn: row.pfx_x != null ? row.pfx_x * 12 : null,
          pfxZIn: row.pfx_z != null ? row.pfx_z * 12 : null,
          extensionFt: row.release_extension ?? null,
        } satisfies ShapeMetrics,
      };
    }

    // kind === "average"
    // Side B's averaged ribbon already has releaseOffset baked in, so
    // path comes through correctly without additional translation.
    const r = sideRibbons.find((x) => x.pitchType === selected.pitchType);
    if (!r) return null;
    const sourcePitches = selected.side === "a" ? aPitches : bPitches;
    const metrics = averageMetrics(sourcePitches, selected.pitchType);
    return {
      pitchType: r.pitchType,
      path: r.path,
      side: selected.side,
      labelPosition: statcastToThree(r.path[r.path.length - 1]),
      label,
      velocity: r.releaseSpeed,
      metrics,
    };
  }, [selected, aPitches, bPitches, aRibbons, bRibbons, releaseOffset, aLabel, bLabel]);

  const showTracers = aRibbons.length + bRibbons.length > 0;
  const hasSelection = selected !== null;

  const selectPitch = useCallback((side: CompareSide, index: number) => {
    setSelected((prev) =>
      prev && prev.kind === "pitch" && prev.side === side && prev.index === index
        ? null
        : { kind: "pitch", side, index },
    );
  }, []);

  const selectAverage = useCallback((side: CompareSide, pitchType: string) => {
    setSelected((prev) =>
      prev &&
      prev.kind === "average" &&
      prev.side === side &&
      prev.pitchType === pitchType
        ? null
        : { kind: "average", side, pitchType },
    );
  }, []);

  return (
    <>
      <Scene
        preset={preset}
        presetTick={presetTick}
        onPointerMissed={() => setSelected(null)}
      >
        <SideLayer
          side="a"
          ribbons={aRibbons}
          pitches={aPitches}
          progress={progress}
          showTracers={showTracers}
          selectedPitchIndex={
            selected?.kind === "pitch" && selected.side === "a" ? selected.index : null
          }
          selectedAveragePitchType={
            selected?.kind === "average" && selected.side === "a" ? selected.pitchType : null
          }
          hasSelection={hasSelection}
          onSelectPitch={(idx) => selectPitch("a", idx)}
          onSelectAverage={(pt) => selectAverage("a", pt)}
        />
        <SideLayer
          side="b"
          ribbons={bRibbons}
          pitches={bPitches}
          progress={progress}
          showTracers={showTracers}
          selectedPitchIndex={
            selected?.kind === "pitch" && selected.side === "b" ? selected.index : null
          }
          selectedAveragePitchType={
            selected?.kind === "average" && selected.side === "b" ? selected.pitchType : null
          }
          hasSelection={hasSelection}
          onSelectPitch={(idx) => selectPitch("b", idx)}
          onSelectAverage={(pt) => selectAverage("b", pt)}
        />
        {selectedRibbon && (
          <>
            {/* For pitch selections we draw a fresh, thicker ribbon for that
                specific pitch's actual kinematics. For average selections
                the SideLayer already renders the matching averaged ribbon at
                a thicker radius, so no extra ribbon is needed here. */}
            {selected?.kind === "pitch" && (
              <Ribbon
                path={selectedRibbon.path}
                pitchType={selectedRibbon.pitchType}
                radius={0.13}
                side={selectedRibbon.side}
              />
            )}
            <Html
              position={selectedRibbon.labelPosition}
              zIndexRange={[10, 0]}
              style={{ pointerEvents: "none" }}
            >
              {/* Two labels anchored at the same 3D point. The wrapper has
                  zero size, so left:0 / right:0 both refer to the anchor. */}
              <div style={{ position: "relative", width: 0, height: 0 }}>
                <div
                  className="absolute whitespace-nowrap px-2 py-1 rounded bg-black/75 backdrop-blur-sm border border-white/15 text-xs text-white/95 tabular-nums shadow-lg"
                  style={{ left: 0, top: 0, transform: "translate(12px, -50%)" }}
                >
                  <span className="font-medium">{selectedRibbon.label}</span>
                  {selectedRibbon.velocity != null && (
                    <span className="text-white/70 ml-1.5">
                      {Number(selectedRibbon.velocity).toFixed(1)} mph
                    </span>
                  )}
                </div>
                <MetricsPanel metrics={selectedRibbon.metrics} />
              </div>
            </Html>
          </>
        )}
        {tunnels.map((t) => (
          <TunnelMarker
            key={`t-${t.pitchType}`}
            position={t.markerPos}
            pitchType={t.pitchType}
          />
        ))}
      </Scene>
      <CameraPad current={preset} onChange={handlePresetChange} />
      {showTracers && (
        <TransportBar flightDuration={flightDuration} onProgressChange={setProgress} />
      )}
      {hasSelection && (
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-white/[0.08] hover:bg-white/[0.14] backdrop-blur-md border border-white/15 text-[11px] uppercase tracking-[0.14em] text-white/85 pointer-events-auto"
        >
          Clear selection
        </button>
      )}
    </>
  );
}

interface SideLayerProps {
  side: CompareSide;
  ribbons: RibbonData[];
  pitches: PitchWithOutcome[];
  progress: number;
  showTracers: boolean;
  selectedPitchIndex: number | null;
  selectedAveragePitchType: string | null;
  hasSelection: boolean;
  onSelectPitch: (index: number) => void;
  onSelectAverage: (pitchType: string) => void;
}

function SideLayer({
  side,
  ribbons,
  pitches,
  progress,
  showTracers,
  selectedPitchIndex,
  selectedAveragePitchType,
  hasSelection,
  onSelectPitch,
  onSelectAverage,
}: SideLayerProps) {
  const hoverOpacity = useOpacityForSide(side);
  const { setHoveredSide } = useCompareHover();

  // Per-mesh handlers: each ribbon and each outcome sphere reports its own
  // hover. The provider debounces "clear" by a tick so transitioning
  // between two meshes (within or across sides) doesn't flicker.
  const onOver = useCallback(() => setHoveredSide(side), [setHoveredSide, side]);
  const onOut = useCallback(() => setHoveredSide(null), [setHoveredSide]);

  return (
    <>
      {ribbons.map((r) => {
        const isSelectedAverage = selectedAveragePitchType === r.pitchType;
        // When something is selected, non-selected averaged ribbons fade
        // out so the focused pitch reads clearly. The selected average
        // (if any) stays full strength and gets a thicker tube.
        const ribbonOpacity =
          hoverOpacity * (hasSelection && !isSelectedAverage ? 0.18 : 1);
        const endPos = statcastToThree(r.path[r.path.length - 1]);
        const ballColor = getPitchColorForSide(r.pitchType, side);
        return (
          <group key={`${side}-${r.pitchType}`}>
            <Ribbon
              path={r.path}
              pitchType={r.pitchType}
              radius={isSelectedAverage ? 0.13 : 0.1}
              side={side}
              opacity={ribbonOpacity}
              onPointerOver={onOver}
              onPointerOut={onOut}
              onClick={(e) => {
                e.stopPropagation();
                onSelectAverage(r.pitchType);
              }}
            />
            <Sphere
              args={[isSelectedAverage ? 0.16 : 0.12, 18, 18]}
              position={endPos}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = "pointer";
                onOver();
              }}
              onPointerOut={() => {
                document.body.style.cursor = "";
                onOut();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectAverage(r.pitchType);
              }}
            >
              <meshStandardMaterial
                color={ballColor}
                roughness={0.4}
                metalness={0.05}
                transparent
                opacity={ribbonOpacity}
                emissive={isSelectedAverage ? ballColor : "#000000"}
                emissiveIntensity={isSelectedAverage ? 0.6 : 0}
              />
            </Sphere>
          </group>
        );
      })}
      <OutcomeMarkers
        pitches={pitches}
        opacity={hoverOpacity}
        selectedIndex={selectedPitchIndex}
        hasSelection={hasSelection}
        onSelect={onSelectPitch}
        onPointerOver={onOver}
        onPointerOut={onOut}
      />
      {showTracers &&
        !hasSelection &&
        ribbons.map((r) => (
          <BallTracer
            key={`${side}-tracer-${r.pitchType}`}
            path={r.path}
            progress={progress}
          />
        ))}
    </>
  );
}

function ribbonsFromMap(byType: Map<string, Pitch>): RibbonData[] {
  const out: RibbonData[] = [];
  for (const [pitchType, pitch] of byType) {
    try {
      out.push({
        pitchType,
        path: pitch.path(48),
        releaseSpeed: pitch.row.release_speed ?? null,
      });
    } catch {
      // skip malformed math
    }
  }
  return out;
}

function avgFirstPoint(ribbons: RibbonData[]): [number, number, number] | null {
  if (ribbons.length === 0) return null;
  let sx = 0,
    sy = 0,
    sz = 0;
  for (const r of ribbons) {
    sx += r.path[0][0];
    sy += r.path[0][1];
    sz += r.path[0][2];
  }
  return [sx / ribbons.length, sy / ribbons.length, sz / ribbons.length];
}

function tunnelMarkerPosition(
  a: Pitch,
  b: Pitch,
  tunnelY: number,
  bOffset: [number, number, number],
): [number, number, number] {
  const pa = a.positionAtY(tunnelY);
  const pb = b.positionAtY(tunnelY);
  return [
    (pa[0] + pb[0] + bOffset[0]) / 2,
    (pa[1] + pb[1] + bOffset[1]) / 2,
    (pa[2] + pb[2] + bOffset[2]) / 2,
  ];
}

function MetricsPanel({ metrics }: { metrics: ShapeMetrics }) {
  const rows: Array<{ label: string; value: string }> = [];
  if (metrics.spinRpm != null) {
    rows.push({ label: "Spin", value: `${Math.round(metrics.spinRpm)} rpm` });
  }
  if (metrics.pfxZIn != null) {
    rows.push({ label: "iVB", value: formatBreak(metrics.pfxZIn) });
  }
  if (metrics.pfxXIn != null) {
    rows.push({ label: "HB", value: formatBreak(metrics.pfxXIn) });
  }
  if (metrics.spinAxis != null) {
    rows.push({ label: "Axis", value: `${Math.round(metrics.spinAxis)}°` });
  }
  if (metrics.extensionFt != null) {
    rows.push({ label: "Ext", value: `${metrics.extensionFt.toFixed(1)} ft` });
  }
  if (rows.length === 0) return null;

  return (
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
  );
}

function formatBreak(inches: number): string {
  const sign = inches >= 0 ? "+" : "";
  return `${sign}${inches.toFixed(1)}"`;
}

function averageMetrics(
  pitches: PitchWithOutcome[],
  pitchType: string,
): ShapeMetrics {
  let spinSum = 0,
    spinN = 0,
    axisSum = 0,
    axisN = 0,
    pxSum = 0,
    pxN = 0,
    pzSum = 0,
    pzN = 0,
    extSum = 0,
    extN = 0;
  for (const p of pitches) {
    if (p.pitch_type !== pitchType) continue;
    if (p.release_spin_rate != null) {
      spinSum += p.release_spin_rate;
      spinN += 1;
    }
    if (p.spin_axis != null) {
      axisSum += p.spin_axis;
      axisN += 1;
    }
    if (p.pfx_x != null) {
      pxSum += p.pfx_x;
      pxN += 1;
    }
    if (p.pfx_z != null) {
      pzSum += p.pfx_z;
      pzN += 1;
    }
    if (p.release_extension != null) {
      extSum += p.release_extension;
      extN += 1;
    }
  }
  return {
    spinRpm: spinN > 0 ? spinSum / spinN : null,
    spinAxis: axisN > 0 ? axisSum / axisN : null,
    pfxXIn: pxN > 0 ? (pxSum / pxN) * 12 : null,
    pfxZIn: pzN > 0 ? (pzSum / pzN) * 12 : null,
    extensionFt: extN > 0 ? extSum / extN : null,
  };
}

function safeDuration(p: Pitch): number {
  try {
    const d = p.flightDuration();
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch {
    return 0;
  }
}
