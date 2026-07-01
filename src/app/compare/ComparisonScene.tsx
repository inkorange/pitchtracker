"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Html, Sphere } from "@react-three/drei";
import { parseAsString, useQueryState } from "nuqs";
import { Scene } from "@/components/scene/Scene";
import { Ribbon } from "@/components/ribbon/Ribbon";
import { BallTracer } from "@/components/ribbon/BallTracer";
import { CameraPad } from "@/components/controls/CameraPad";
import { EnvToggleGear } from "@/components/controls/EnvToggleGear";
import { TransportBar } from "@/components/controls/TransportBar";
import { HeatGridPlane } from "@/components/scene/HeatGridPlane";
import {
  buildHeatGrid,
  parseHeatMetric,
  HEAT_METRIC_LABELS,
  type HeatMetric,
} from "@/lib/pitch/heatGrid";
import {
  averagePitchesByType,
  pitchFromRow,
  type CachedPitchSubset,
} from "@/lib/pitch/averages";
import { computeTunnelStats } from "@/lib/pitch/tunneling";
import type { Pitch } from "@/lib/pitch/Pitch";
import { statcastToThree } from "@/lib/viz/coords";
import type { CameraPosition, CameraPreset } from "@/lib/viz/camera-presets";
import { TunnelMarker } from "./TunnelMarker";
import { OutcomeMarkers } from "./OutcomeMarkers";
import { useCompareHover, useOpacityForSide } from "./CompareHoverContext";
import { getPitchColorForSide, type CompareSide } from "@/lib/viz/colors";

interface PitchWithOutcome extends CachedPitchSubset {
  description?: string | null;
}

interface ShapeMetrics {
  spinRpm: number | null;
  spinAxis: number | null;
  pfxXIn: number | null; // horizontal break, inches
  pfxZIn: number | null; // induced vertical break, inches
  extensionFt: number | null;
  // Sample size that produced the averages. Surfaced as "avg of N
  // pitches" in the hover panel so the viewer knows the ribbon is a
  // composite, not a single pitch's actual flight.
  count: number;
}

// Long names for the common pitch_type abbreviations. The hover panel
// surfaces "FF · 4-seam fastball" so a viewer who doesn't know the
// codes can still read what they're seeing.
const PITCH_TYPE_LONG_NAMES: Record<string, string> = {
  FF: "4-seam fastball",
  SI: "sinker",
  FC: "cutter",
  SL: "slider",
  ST: "sweeper",
  CU: "curveball",
  KC: "knuckle curve",
  SV: "slurve",
  CS: "slow curve",
  CH: "changeup",
  FS: "splitter",
  FO: "forkball",
  EP: "eephus",
  KN: "knuckleball",
};
function pitchTypeLongName(code: string): string | null {
  return PITCH_TYPE_LONG_NAMES[code] ?? null;
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
  const [preset, setPreset] = useState<CameraPreset>("front");
  const [presetTick, setPresetTick] = useState(0);
  const handlePresetChange = (next: CameraPreset) => {
    setPreset(next);
    setPresetTick((t) => t + 1);
  };

  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<Selection | null>(null);
  // Hover state — drives the floating metrics panel without requiring
  // a click. When the user hovers an averaged ribbon, we surface its
  // pitch type + count + avg metrics. A click-selection still wins:
  // if `selected` is set, the panel follows the selection and hover
  // is ignored until the selection is cleared.
  const [hoveredAverage, setHoveredAverage] = useState<{
    side: CompareSide;
    pitchType: string;
  } | null>(null);
  // Show the per-pitch outcome dots (one sphere per individual pitch
  // at its actual plate-end location)? Default OFF so the averaged
  // ribbons are the primary read; the dots are a power-user "show me
  // every actual outcome" toggle.
  const [showOutcomes, setShowOutcomes] = useState(false);

  // Heat-grid overlay — mirrors the pitcher arsenal page's ?heat
  // query state. Combines BOTH pitchers' pitches into one grid (the
  // compare view is overlaid in shared 3D space, so a single combined
  // grid reads as "where ALL these pitches land" with the same
  // metric the pitcher page uses).
  const [heatParam, setHeatParam] = useQueryState(
    "heat",
    parseAsString.withDefault(""),
  );
  const heatMetric = parseHeatMetric(heatParam);
  const heatGrid = useMemo(() => {
    if (!heatMetric) return null;
    const combined = [...aPitches, ...bPitches].map((p) => ({
      plate_x: p.plate_x,
      plate_z: p.plate_z,
      description: p.description ?? null,
    }));
    return buildHeatGrid(combined, heatMetric);
  }, [heatMetric, aPitches, bPitches]);

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

  // Build the panel ribbon (path + label + metrics) from either the
  // sticky selection or the transient hover. Selection wins when both
  // are set; hover is shorthand for "show me the metrics for this
  // ribbon while my pointer is on it".
  //
  // Two kinds:
  //   "pitch":   one specific cached pitch — build its path from kinematics
  //   "average": one averaged-by-type ribbon — reuse its already-built path
  // Side B paths in both cases inherit the release-point offset that the
  // averaged B ribbons received, so the selection lines up with its
  // averaged ribbon when normalizeRelease is on.
  const selectedRibbon = useMemo(() => {
    const effective: Selection | null =
      selected ??
      (hoveredAverage
        ? {
            kind: "average",
            side: hoveredAverage.side,
            pitchType: hoveredAverage.pitchType,
          }
        : null);
    if (!effective) return null;
    const sideRibbons = effective.side === "a" ? aRibbons : bRibbons;
    const label = effective.side === "a" ? aLabel : bLabel;

    if (effective.kind === "pitch") {
      const list = effective.side === "a" ? aPitches : bPitches;
      const row = list[effective.index];
      if (!row) return null;
      const pitch = pitchFromRow(row);
      if (!pitch) return null;
      let path: Array<[number, number, number]>;
      try {
        path = pitch.path(48);
      } catch {
        return null;
      }
      if (effective.side === "b") {
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
        side: effective.side,
        labelPosition: statcastToThree(path[path.length - 1]),
        label,
        velocity: row.release_speed,
        metrics: {
          // A pitch selection is one real pitch — count surfaces as 1
          // so the MetricsPanel can suppress the "avg of N" framing.
          count: 1,
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
    const r = sideRibbons.find((x) => x.pitchType === effective.pitchType);
    if (!r) return null;
    const sourcePitches = effective.side === "a" ? aPitches : bPitches;
    const metrics = averageMetrics(sourcePitches, effective.pitchType);
    return {
      pitchType: r.pitchType,
      path: r.path,
      side: effective.side,
      labelPosition: statcastToThree(r.path[r.path.length - 1]),
      label,
      velocity: r.releaseSpeed,
      metrics,
    };
  }, [
    selected,
    hoveredAverage,
    aPitches,
    bPitches,
    aRibbons,
    bRibbons,
    releaseOffset,
    aLabel,
    bLabel,
  ]);

  const showTracers = aRibbons.length + bRibbons.length > 0;
  const hasSelection = selected !== null;

  // Compare-specific FRONT override. The static FRONT preset is tuned
  // for the pitcher arsenal page (heavily shifted toward 3B so the
  // wide info panel doesn't block the action). On compare we want a
  // mostly head-on hitter's-eye view with the strike zone centered in
  // the visible area to the right of the info panel — pulled in
  // closer than the arsenal preset, with a small lateral offset that
  // reads as "turned" without going off-axis.
  const frontOverride: CameraPosition | null = useMemo(() => {
    if (preset !== "front") return null;
    return {
      position: [-1.5, 3.7, 9],
      target: [0.5, 2.8, -20],
    };
  }, [preset]);

  // Mirror the selected side into the shared CompareHoverContext so
  // the pitcher card above can glow in matching A/B color when the
  // user clicks a pitch in the 3D scene. Cleared when nothing is
  // selected (pointer-missed or selection toggled off).
  const { setSelectedSide } = useCompareHover();
  useEffect(() => {
    setSelectedSide(selected ? selected.side : null);
  }, [selected, setSelectedSide]);

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
        presetOverride={frontOverride}
        onPointerMissed={() => setSelected(null)}
      >
        <SideLayer
          side="a"
          ribbons={aRibbons}
          pitches={aPitches}
          progress={progress}
          showTracers={showTracers}
          showOutcomes={showOutcomes}
          selectedPitchIndex={
            selected?.kind === "pitch" && selected.side === "a" ? selected.index : null
          }
          selectedAveragePitchType={
            selected?.kind === "average" && selected.side === "a" ? selected.pitchType : null
          }
          hoveredAveragePitchType={
            hoveredAverage?.side === "a" ? hoveredAverage.pitchType : null
          }
          hasSelection={hasSelection}
          onSelectPitch={(idx) => selectPitch("a", idx)}
          onSelectAverage={(pt) => selectAverage("a", pt)}
          onHoverAverage={(pt) =>
            setHoveredAverage(pt ? { side: "a", pitchType: pt } : null)
          }
        />
        <SideLayer
          side="b"
          ribbons={bRibbons}
          pitches={bPitches}
          progress={progress}
          showTracers={showTracers}
          showOutcomes={showOutcomes}
          selectedPitchIndex={
            selected?.kind === "pitch" && selected.side === "b" ? selected.index : null
          }
          selectedAveragePitchType={
            selected?.kind === "average" && selected.side === "b" ? selected.pitchType : null
          }
          hoveredAveragePitchType={
            hoveredAverage?.side === "b" ? hoveredAverage.pitchType : null
          }
          hasSelection={hasSelection}
          onSelectPitch={(idx) => selectPitch("b", idx)}
          onSelectAverage={(pt) => selectAverage("b", pt)}
          onHoverAverage={(pt) =>
            setHoveredAverage(pt ? { side: "b", pitchType: pt } : null)
          }
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
                <MetricsPanel
                  metrics={selectedRibbon.metrics}
                  pitchType={selectedRibbon.pitchType}
                />
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
        {heatGrid ? <HeatGridPlane grid={heatGrid} /> : null}
      </Scene>
      <CameraPad
        current={preset}
        onChange={handlePresetChange}
        leftSlot={<EnvToggleGear />}
      />
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
      {/* Outcome-dot toggle. Default OFF — the per-pitch ending dots
          at the plate were the main visual noise when comparing two
          arsenals overlaid, so the averaged ribbons are now the
          primary read. Toggle on if you want to see every actual
          ending location alongside the averages. */}
      <button
        type="button"
        onClick={() => setShowOutcomes((v) => !v)}
        title={
          showOutcomes
            ? "Hide individual pitch ending locations at the plate"
            : "Show one dot per individual pitch at its plate-end location"
        }
        className="absolute top-4 right-4 px-2.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] backdrop-blur-md border border-white/15 text-[10px] uppercase tracking-[0.16em] text-white/80 hover:text-white pointer-events-auto inline-flex items-center gap-1.5"
      >
        <span
          aria-hidden
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            showOutcomes ? "bg-emerald-400" : "bg-white/30"
          }`}
        />
        Outcomes
      </button>
      {/* Heat-grid overlay toggle. Mirrors the pitcher arsenal page —
          ?heat=whiff|chase|called|csw on/off + metric chip picker. The
          grid here combines BOTH pitchers' pitches because the compare
          view overlays the arsenals; the combined grid reads as
          "where do all these pitches end up" with the same metric the
          single-pitcher page surfaces. */}
      <HeatToggle
        metric={heatMetric}
        onSelect={(m) => setHeatParam(m)}
      />
    </>
  );
}

interface SideLayerProps {
  side: CompareSide;
  ribbons: RibbonData[];
  pitches: PitchWithOutcome[];
  progress: number;
  showTracers: boolean;
  showOutcomes: boolean;
  selectedPitchIndex: number | null;
  selectedAveragePitchType: string | null;
  hoveredAveragePitchType: string | null;
  hasSelection: boolean;
  onSelectPitch: (index: number) => void;
  onSelectAverage: (pitchType: string) => void;
  onHoverAverage: (pitchType: string | null) => void;
}

function SideLayer({
  side,
  ribbons,
  pitches,
  progress,
  showTracers,
  showOutcomes,
  selectedPitchIndex,
  selectedAveragePitchType,
  hoveredAveragePitchType,
  hasSelection,
  onSelectPitch,
  onSelectAverage,
  onHoverAverage,
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
        const isHoveredAverage = hoveredAveragePitchType === r.pitchType;
        // Highlight whatever is currently focused — either the sticky
        // selection or the transient hover — by drawing it at the
        // thicker radius. Both fade other ribbons down to 18% opacity
        // so the focused pitch reads clearly. When nothing is focused
        // and nothing selected, all ribbons render at full strength.
        const focused = isSelectedAverage || isHoveredAverage;
        const focusActive = hasSelection || hoveredAveragePitchType != null;
        const ribbonOpacity =
          hoverOpacity * (focusActive && !focused ? 0.18 : 1);
        const endPos = statcastToThree(r.path[r.path.length - 1]);
        const ballColor = getPitchColorForSide(r.pitchType, side);
        const handleHoverEnter = () => {
          onOver();
          onHoverAverage(r.pitchType);
        };
        const handleHoverLeave = () => {
          onOut();
          onHoverAverage(null);
        };
        return (
          <group key={`${side}-${r.pitchType}`}>
            <Ribbon
              path={r.path}
              pitchType={r.pitchType}
              radius={focused ? 0.13 : 0.1}
              side={side}
              opacity={ribbonOpacity}
              onPointerOver={handleHoverEnter}
              onPointerOut={handleHoverLeave}
              onClick={(e) => {
                e.stopPropagation();
                onSelectAverage(r.pitchType);
              }}
            />
            <Sphere
              args={[focused ? 0.16 : 0.12, 18, 18]}
              position={endPos}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = "pointer";
                handleHoverEnter();
              }}
              onPointerOut={() => {
                document.body.style.cursor = "";
                handleHoverLeave();
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
                emissive={focused ? ballColor : "#000000"}
                emissiveIntensity={focused ? 0.6 : 0}
              />
            </Sphere>
          </group>
        );
      })}
      {showOutcomes && (
        <OutcomeMarkers
          pitches={pitches}
          opacity={hoverOpacity}
          selectedIndex={selectedPitchIndex}
          hasSelection={hasSelection}
          onSelect={onSelectPitch}
          onPointerOver={onOver}
          onPointerOut={onOut}
        />
      )}
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

// Heat-grid overlay toggle. Mirrors the look of the pitcher arsenal
// page's HeatToggle so the two views share visual language. Trimmed
// version — no help modal here; the metric's behavior is the same as
// the pitcher page so the explainer over there covers both.
const HEAT_METRIC_OPTIONS: HeatMetric[] = ["whiff", "chase", "called", "csw"];

function HeatToggle({
  metric,
  onSelect,
}: {
  metric: HeatMetric | null;
  onSelect: (next: HeatMetric | null) => void;
}) {
  const active = metric !== null;
  const label = active
    ? `Heat: ${HEAT_METRIC_LABELS[metric].replace(" %", "")}`
    : "Heat";
  return (
    <div className="absolute bottom-32 right-3 sm:right-6 z-20 flex flex-col items-end gap-1 pointer-events-auto">
      <button
        type="button"
        onClick={() => onSelect(active ? null : "whiff")}
        title="Show a per-zone heat grid across both pitchers' pitches"
        className={`px-3 py-1.5 rounded-md backdrop-blur-md border text-[11px] uppercase tracking-[0.14em] transition-colors ${
          active
            ? "bg-[#5fc7d8]/30 border-[#5fc7d8]/55 text-white"
            : "bg-[#081a32]/45 border-white/10 text-white/65 hover:text-white hover:bg-[#0e2a4d]/70 hover:border-white/20"
        }`}
      >
        {label}
      </button>
      {active ? (
        <div
          className="flex items-center gap-1 mt-0.5"
          role="radiogroup"
          aria-label="Heat metric"
        >
          {HEAT_METRIC_OPTIONS.map((m) => {
            const isActive = m === metric;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => onSelect(m)}
                title={HEAT_METRIC_LABELS[m]}
                className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-[0.12em] backdrop-blur-md border transition-colors ${
                  isActive
                    ? "bg-[#5fc7d8]/30 border-[#5fc7d8]/55 text-white"
                    : "bg-[#081a32]/45 border-white/10 text-white/55 hover:text-white hover:bg-[#0e2a4d]/70 hover:border-white/20"
                }`}
              >
                {HEAT_METRIC_LABELS[m].replace(" %", "")}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MetricsPanel({
  metrics,
  pitchType,
}: {
  metrics: ShapeMetrics;
  pitchType: string;
}) {
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
  const longName = pitchTypeLongName(pitchType);
  // count > 1 ⇒ averaged ribbon (the common case in the compare view);
  // count === 1 ⇒ a single-pitch selection. Suppress the "avg of" line
  // in the single-pitch case so the panel doesn't lie.
  const showAvgHeader = metrics.count > 1;
  if (rows.length === 0 && !longName && !showAvgHeader) return null;

  return (
    <div
      className="absolute whitespace-nowrap px-2.5 py-1.5 rounded bg-black/75 backdrop-blur-sm border border-white/15 text-[11px] text-white/95 tabular-nums shadow-lg"
      style={{ right: 0, top: 0, transform: "translate(-12px, -50%)" }}
    >
      {(longName || showAvgHeader) && (
        <div className="flex flex-col gap-0.5 pb-1 mb-1 border-b border-white/10 normal-nums">
          {longName && (
            <div className="text-white/90">
              <span className="text-white/55 mr-1">{pitchType}</span>
              {longName}
            </div>
          )}
          {showAvgHeader && (
            <div className="text-[10px] text-white/45">
              avg of {metrics.count} pitches
            </div>
          )}
        </div>
      )}
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
  // The count we surface in the UI is the number of pitches of this
  // type, not the per-metric sample size. Even when a few rows lack
  // spin/extension, the trajectory itself is still based on n total.
  const matched = pitches.filter((p) => p.pitch_type === pitchType).length;
  return {
    count: matched,
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
