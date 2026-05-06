"use client";

import { useCallback, useMemo, useState } from "react";
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
import type { CameraPreset } from "@/lib/viz/camera-presets";
import { TunnelMarker } from "./TunnelMarker";
import { OutcomeMarkers } from "./OutcomeMarkers";
import { useCompareHover, useOpacityForSide } from "./CompareHoverContext";
import type { CompareSide } from "@/lib/viz/colors";

interface PitchWithOutcome extends CachedPitchSubset {
  description?: string | null;
}

interface ComparisonSceneProps {
  aPitches: PitchWithOutcome[];
  bPitches: PitchWithOutcome[];
  // When true (default), translate both pitchers' paths so they share a
  // common release origin. Lets the user compare pitch SHAPE rather than
  // arm-slot differences. Set false for "true release" mode.
  normalizeRelease?: boolean;
}

interface RibbonData {
  pitchType: string;
  path: Array<[number, number, number]>;
}

interface MatchedTunnel {
  pitchType: string;
  markerPos: [number, number, number];
  tunnelY: number;
}

export function ComparisonScene({
  aPitches,
  bPitches,
  normalizeRelease = true,
}: ComparisonSceneProps) {
  const [preset, setPreset] = useState<CameraPreset>("side");
  const [presetTick, setPresetTick] = useState(0);
  const handlePresetChange = (next: CameraPreset) => {
    setPreset(next);
    setPresetTick((t) => t + 1);
  };

  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<{ side: CompareSide; index: number } | null>(null);

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
        releaseOffset = [
          aRelease[0] - bRelease[0],
          aRelease[1] - bRelease[1],
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

  // Build the selected pitch's actual trajectory. Side B's path gets
  // the same release-point offset that the averaged B ribbons received,
  // so a selected B pitch lines up with its averaged ribbon when
  // normalizeRelease is on.
  const selectedRibbon = useMemo(() => {
    if (!selected) return null;
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
    };
  }, [selected, aPitches, bPitches, releaseOffset]);

  const showTracers = aRibbons.length + bRibbons.length > 0;
  const hasSelection = selected !== null;

  const selectPitch = useCallback(
    (side: CompareSide, index: number) => {
      setSelected((prev) =>
        prev && prev.side === side && prev.index === index ? null : { side, index },
      );
    },
    [],
  );

  return (
    <>
      <Scene preset={preset} presetTick={presetTick}>
        <SideLayer
          side="a"
          ribbons={aRibbons}
          pitches={aPitches}
          progress={progress}
          showTracers={showTracers}
          selectedIndex={selected?.side === "a" ? selected.index : null}
          hasSelection={hasSelection}
          onSelect={(idx) => selectPitch("a", idx)}
        />
        <SideLayer
          side="b"
          ribbons={bRibbons}
          pitches={bPitches}
          progress={progress}
          showTracers={showTracers}
          selectedIndex={selected?.side === "b" ? selected.index : null}
          hasSelection={hasSelection}
          onSelect={(idx) => selectPitch("b", idx)}
        />
        {selectedRibbon && (
          <Ribbon
            path={selectedRibbon.path}
            pitchType={selectedRibbon.pitchType}
            radius={0.13}
            side={selectedRibbon.side}
          />
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
  selectedIndex: number | null;
  hasSelection: boolean;
  onSelect: (index: number) => void;
}

function SideLayer({
  side,
  ribbons,
  pitches,
  progress,
  showTracers,
  selectedIndex,
  hasSelection,
  onSelect,
}: SideLayerProps) {
  const hoverOpacity = useOpacityForSide(side);
  const { setHoveredSide } = useCompareHover();

  // Per-mesh handlers: each ribbon and each outcome sphere reports its own
  // hover. The provider debounces "clear" by a tick so transitioning
  // between two meshes (within or across sides) doesn't flicker.
  const onOver = useCallback(() => setHoveredSide(side), [setHoveredSide, side]);
  const onOut = useCallback(() => setHoveredSide(null), [setHoveredSide]);

  // When a single pitch is selected, fade the averaged ribbons so the
  // selected pitch's own trajectory reads clearly.
  const ribbonOpacity = hoverOpacity * (hasSelection ? 0.18 : 1);

  return (
    <>
      {ribbons.map((r) => (
        <Ribbon
          key={`${side}-${r.pitchType}`}
          path={r.path}
          pitchType={r.pitchType}
          radius={0.1}
          side={side}
          opacity={ribbonOpacity}
          onPointerOver={onOver}
          onPointerOut={onOut}
        />
      ))}
      <OutcomeMarkers
        pitches={pitches}
        opacity={hoverOpacity}
        selectedIndex={selectedIndex}
        hasSelection={hasSelection}
        onSelect={onSelect}
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
      out.push({ pitchType, path: pitch.path(48) });
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

function safeDuration(p: Pitch): number {
  try {
    const d = p.flightDuration();
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch {
    return 0;
  }
}
