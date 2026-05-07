"use client";

import { useEffect, useMemo, useState } from "react";
import { Html, Sphere } from "@react-three/drei";
import { Pitch, type StatcastRow } from "@/lib/pitch/Pitch";
import { Scene } from "@/components/scene/Scene";
import { Ribbon } from "@/components/ribbon/Ribbon";
import { CameraPad } from "@/components/controls/CameraPad";
import { TunnelMesh } from "@/components/scene/TunnelMesh";
import { statcastToThree } from "@/lib/viz/coords";
import { getOutcomeColor, getPitchLabel } from "@/lib/viz/colors";
import type { CameraPreset } from "@/lib/viz/camera-presets";
import {
  buildTunnelEnvelope,
  type TunnelEnvelope,
} from "@/lib/pitch/tunnelEnvelope";
import type { ReplayPitch } from "@/app/at-bat/[gamePk]/[atBatNumber]/AtBatReplayScene";
import {
  AtBatPlaybackBar,
  AtBatPlaybackLayer,
  useAtBatPlayback,
} from "./AtBatPlaybackLayer";

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
  /**
   * When set, the Scene's children swap into at-bat playback mode:
   * progressive ribbon draws + ball tracer for the active pitch +
   * transport bar at the bottom (in place of the camera pad). The
   * arsenal entries / sphere markers / tunnel envelope are hidden
   * for the duration. Filters in the side panel collapse via
   * FiltersGate so this is the focused view.
   */
  atBatPitches?: ReplayPitch[] | null;
}

interface PitchEntry {
  id: string;
  path: Array<[number, number, number]>;
  pitchType: string;
  outcomeColor: string;
  platePosition: [number, number, number] | null;
  source: CachedPitch;
}

export function PitcherArsenalScene({
  pitches,
  pitcherLabel,
  atBatPitches,
}: PitcherArsenalSceneProps) {
  const [preset, setPreset] = useState<CameraPreset>("front");
  const [presetTick, setPresetTick] = useState(0);
  const handlePresetChange = (next: CameraPreset) => {
    setPreset(next);
    // Bump even when next === preset so the rig retriggers and the user
    // can re-click an active preset to snap back after orbiting away.
    setPresetTick((t) => t + 1);
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tunnelOn, setTunnelOn] = useState(false);

  const tunnelEnvelope = useMemo<TunnelEnvelope | null>(() => {
    if (!tunnelOn) return null;
    return buildTunnelEnvelope(pitches);
  }, [tunnelOn, pitches]);

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

  // At-bat playback state — only meaningful when `atBatPitches` is
  // set, but the hook runs unconditionally so the same Scene
  // component instance survives mode swaps without remounting.
  const playback = useAtBatPlayback(atBatPitches ?? []);
  const inAtBatMode = atBatPitches != null && atBatPitches.length > 0;

  return (
    <>
      <Scene
        preset={preset}
        presetTick={presetTick}
        onPointerMissed={inAtBatMode ? undefined : () => setSelectedId(null)}
      >
        {inAtBatMode ? (
          <AtBatPlaybackLayer
            state={playback.state}
            handlers={playback.handlers}
          />
        ) : null}
        {!inAtBatMode && entries.map((e) => {
          const isSelected = selectedEntry?.id === e.id;
          // Tunnel mode dims pitches to 0.1 so the cone reads as the
          // dominant element. Selection still pulls focus when
          // something is clicked, even with the tunnel showing.
          const baseOpacity = tunnelOn ? 0.1 : 1;
          const opacity = !hasSelection
            ? baseOpacity
            : isSelected
              ? 1
              : Math.min(baseOpacity, 0.18);
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
                    depthWrite={opacity >= 0.95}
                    emissive={isSelected ? e.outcomeColor : "#000000"}
                    emissiveIntensity={isSelected ? 0.6 : 0}
                  />
                </Sphere>
              )}
            </group>
          );
        })}
        {!inAtBatMode && selectedEntry && (
          <SelectedLabels entry={selectedEntry} pitcherLabel={pitcherLabel} />
        )}
        {!inAtBatMode && tunnelEnvelope ? (
          <>
            <TunnelMesh envelope={tunnelEnvelope} opacity={0.75} />
            <TunnelStatsLabel envelope={tunnelEnvelope} />
          </>
        ) : null}
      </Scene>
      {/* Bottom-of-screen controls swap with the mode. Camera pad +
          tunnel toggle for arsenal browsing; transport bar for
          at-bat playback. */}
      <CameraPad current={preset} onChange={handlePresetChange} />
      {inAtBatMode ? (
        <AtBatPlaybackBar
          state={playback.state}
          handlers={playback.handlers}
        />
      ) : (
        <>
          <TunnelToggle
            active={tunnelOn}
            unavailable={tunnelOn && !tunnelEnvelope}
            onToggle={() => setTunnelOn((v) => !v)}
          />
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
    <Html position={anchor} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
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

// Toggle button + help icon for the tunnel overlay. Sits above the
// camera pad, right-aligned so it shares the bottom-right "scene
// chrome" zone.
function TunnelToggle({
  active,
  unavailable,
  onToggle,
}: {
  active: boolean;
  unavailable: boolean;
  onToggle: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <>
      <div className="absolute bottom-20 right-3 sm:right-6 z-20 flex flex-col items-end gap-1 pointer-events-auto">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={active}
            className={`px-3 py-1.5 rounded-md text-[11px] uppercase tracking-[0.14em] backdrop-blur-md border transition-colors ${
              active
                ? "bg-[#5fc7d8]/20 border-[#5fc7d8]/45 text-white"
                : "bg-[#081a32]/80 border-white/10 text-white/65 hover:text-white hover:bg-[#0e2a4d]/80"
            }`}
            title="Show the pitch-tunnel envelope across the current pitch types."
          >
            Tunnel {active ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="What is pitch tunneling?"
            className="w-7 h-7 rounded-full text-[12px] font-semibold backdrop-blur-md border bg-[#081a32]/80 border-white/10 text-white/65 hover:text-white hover:bg-[#0e2a4d]/80 transition-colors flex items-center justify-center"
            title="How tunneling is calculated"
          >
            ?
          </button>
        </div>
        {unavailable ? (
          <span className="text-[10px] text-amber-300/85 px-2 py-0.5 rounded bg-black/40 backdrop-blur-sm">
            Need ≥ 2 pitch types
          </span>
        ) : null}
      </div>
      {helpOpen ? <TunnelHelp onClose={() => setHelpOpen(false)} /> : null}
    </>
  );
}

// Modal explainer. Backdrop click + ESC dismiss. Content is plain text
// — no diagrams — kept short enough to read in one sitting on a
// laptop.
function TunnelHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 pointer-events-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tunnel-help-title"
    >
      <div
        className="w-full max-w-xl bg-[#0a0e14] border border-white/15 rounded-lg shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-white/[0.08] sticky top-0 bg-[#0a0e14]">
          <h2
            id="tunnel-help-title"
            className="text-base font-semibold text-white tracking-tight"
          >
            How pitch tunneling works
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-white/55 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 text-[13px] text-white/85 leading-relaxed">
          <section className="space-y-2">
            <h3 className="text-[11px] uppercase tracking-[0.16em] text-[#5fc7d8]">
              The idea
            </h3>
            <p>
              Two pitches that share a nearly identical trajectory out of
              the hand — and only diverge close to the plate — give the
              batter no time to identify what&apos;s coming. The window
              where pitches still look the same is called the{" "}
              <strong>tunnel</strong>. Longer tunnel + bigger late break ={" "}
              harder to hit.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] uppercase tracking-[0.16em] text-[#5fc7d8]">
              What you&apos;re looking at
            </h3>
            <ul className="space-y-1.5 list-disc pl-5">
              <li>
                <strong>Cyan cone</strong> — wraps the average flight path
                of every pitch type in the current selection, from release
                to the point where the bundle visibly diverges.
              </li>
              <li>
                <strong>Yellow ring</strong> — the &ldquo;commit point&rdquo;
                at <span className="tabular-nums">23.8 ft</span> from the
                plate (≈167 ms before contact). This is where Baseball
                Prospectus measures their published Tunnel Differential.
              </li>
              <li>
                <strong>Pitch ribbons</strong> — fade to 10% opacity inside
                the cone so the tunnel reads as the dominant element.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] uppercase tracking-[0.16em] text-[#5fc7d8]">
              How it&apos;s calculated
            </h3>
            <ol className="space-y-1.5 list-decimal pl-5">
              <li>
                Group the selected pitches by pitch type (FF, SL, CU, …).
                Drop types with fewer than 3 pitches.
              </li>
              <li>
                For every half-foot from release to plate, compute each
                type&apos;s <em>mean position</em> at that distance using
                the constant-acceleration trajectory model.
              </li>
              <li>
                The <em>between-type spread</em> at any distance is the
                largest pairwise distance between two type means.
              </li>
              <li>
                The <em>baseline</em> is the spread at release — the
                pitcher&apos;s natural arm-slot variance. We subtract it
                out so we measure flight-time divergence, not slot
                sloppiness.
              </li>
              <li>
                The tunnel <strong>ends</strong> at the first distance
                where spread has grown by more than{" "}
                <span className="tabular-nums">1 baseball width
                (≈2.94&Prime;)</span> beyond the baseline.
              </li>
              <li>
                The cone&apos;s <em>spine</em> follows the centroid of the
                type means. Its <em>radius</em> at each step is the 90th
                percentile distance from individual pitches to that
                centroid — wraps most of the bundle without ballooning
                around outliers.
              </li>
            </ol>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] uppercase tracking-[0.16em] text-[#5fc7d8]">
              Reading the stats
            </h3>
            <dl className="space-y-1">
              <div className="flex gap-3">
                <dt className="text-white/55 w-32 flex-shrink-0">Tunnel length</dt>
                <dd>How far before pitches diverge by &gt; 1 baseball.</dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-white/55 w-32 flex-shrink-0">Release spread</dt>
                <dd>Slot consistency. Smaller = tighter delivery.</dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-white/55 w-32 flex-shrink-0">Commit spread</dt>
                <dd>Distance between types at the 23.8 ft commit point — the BP industry metric.</dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-white/55 w-32 flex-shrink-0">Plate spread</dt>
                <dd>How far apart the types end up at the plate.</dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-white/55 w-32 flex-shrink-0">Plate : Commit</dt>
                <dd>Late-break payoff. &gt; 1 means the bundle blooms after the batter has to commit.</dd>
              </div>
            </dl>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] uppercase tracking-[0.16em] text-[#5fc7d8]">
              Caveat on filters
            </h3>
            <p>
              Filtering by outcome (whiff, in-play, ball) recomputes the
              tunnel from <em>only those pitches</em>. The result describes
              the divergence pattern of that subset, not the
              pitcher&apos;s overall tunneling — long tunnels for in-play
              pitches usually mean those pitches all clustered near the
              zone, not that the pitcher fooled anyone.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

// Stats overlay anchored at the spine midpoint. Mirrors the
// SelectedLabels two-card layout — headline on the left, stat rows on
// the right — so the feature feels native to the existing scene UI.
function TunnelStatsLabel({ envelope }: { envelope: TunnelEnvelope }) {
  const mid = envelope.spine[Math.floor(envelope.spine.length / 2)];
  const anchor = statcastToThree(mid);
  const s = envelope.stats;
  const headline = `Tunnel ${s.tunnelLengthFt.toFixed(1)} ft`;
  const sub = `ends ${s.endDistanceFromPlateFt.toFixed(1)} ft from plate`;
  const rows: Array<{ label: string; value: string }> = [
    { label: "Release spread", value: `${s.releaseSpreadIn.toFixed(1)}"` },
    { label: "Commit spread", value: `${s.commitSpreadIn.toFixed(1)}"` },
    { label: "Plate spread", value: `${s.plateSpreadIn.toFixed(1)}"` },
    {
      label: "Plate:Commit",
      value:
        s.plateToCommit >= 99
          ? "—"
          : `${s.plateToCommit.toFixed(1)}×`,
    },
    { label: "Pitches", value: `${s.n} (${s.types.join(" · ")})` },
  ];
  return (
    <Html position={anchor} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div style={{ position: "relative", width: 0, height: 0 }}>
        <div
          className="absolute whitespace-nowrap px-2 py-1 rounded bg-black/80 backdrop-blur-sm border border-[#5fc7d8]/35 text-xs text-white/95 tabular-nums shadow-lg"
          style={{ left: 0, top: 0, transform: "translate(14px, -130%)" }}
        >
          <span className="font-medium">{headline}</span>
          <span className="text-white/60 ml-1.5">{sub}</span>
        </div>
        <div
          className="absolute whitespace-nowrap px-2 py-1.5 rounded bg-black/80 backdrop-blur-sm border border-[#5fc7d8]/35 text-[11px] text-white/95 tabular-nums shadow-lg"
          style={{ left: 0, top: 0, transform: "translate(14px, 10%)" }}
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
      </div>
    </Html>
  );
}
