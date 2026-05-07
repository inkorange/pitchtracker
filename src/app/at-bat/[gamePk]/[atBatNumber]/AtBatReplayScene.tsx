"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Sphere } from "@react-three/drei";
import { CatmullRomCurve3, Vector3 } from "three";
import { Scene } from "@/components/scene/Scene";
import { Ribbon } from "@/components/ribbon/Ribbon";
import { BallTracer } from "@/components/ribbon/BallTracer";
import { BatterSilhouette, frontPresetForStand } from "@/components/scene/BatterSilhouette";
import { BaseballGlyph } from "@/components/icons/BaseballGlyph";
import { CameraPad } from "@/components/controls/CameraPad";
import { Pitch, type StatcastRow } from "@/lib/pitch/Pitch";
import { statcastToThree } from "@/lib/viz/coords";
import { categorizeDescription, OUTCOME_COLORS, getPitchLabel } from "@/lib/viz/colors";
import type {
  CameraPosition,
  CameraPreset,
} from "@/lib/viz/camera-presets";

export interface ReplayPitch {
  game_pk: number;
  at_bat_number: number;
  pitch_number: number;
  pitcher_id: number | null;
  batter_id: number | null;
  pitch_type: string | null;
  pitch_name: string | null;
  description: string | null;
  events: string | null;
  balls: number | null;
  strikes: number | null;
  outs_when_up: number | null;
  inning: number | null;
  inning_topbot: string | null;
  stand: string | null;
  p_throws: string | null;
  on_1b: number | null;
  on_2b: number | null;
  on_3b: number | null;
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

interface AtBatReplaySceneProps {
  pitches: ReplayPitch[];
  initialCamera: CameraPreset;
  // Optional pitch index to highlight (selectedDetailIdx) on mount —
  // used by the daily-feature / OG deep links. Does NOT skip playback
  // past prior pitches; playback always starts at idx 0 and animates
  // through. The highlight just shows the metrics overlay on that
  // specific pitch once it's landed (or when manually clicked).
  initialHighlightIdx: number | null;
}

interface PreparedPitch {
  raw: ReplayPitch;
  pitch: Pitch | null;
  path: Array<[number, number, number]> | null;
  flightDuration: number;
  platePos: [number, number, number] | null;
}

// Pause before the next pitch starts animating, so the user has time
// to read the outcome chip on the pitch that just landed.
const POST_PITCH_DELAY_S = 1.4;
// Slow the actual pitch animation down a bit relative to wall-clock —
// 0.4s of real flight is too fast to feel cinematic. Multiplier > 1
// stretches the per-pitch flight time.
const FLIGHT_TIME_MULTIPLIER = 2.5;

export function AtBatReplayScene({
  pitches,
  initialCamera,
  initialHighlightIdx,
}: AtBatReplaySceneProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [preset, setPreset] = useState<CameraPreset>(initialCamera);
  const [presetTick, setPresetTick] = useState(0);

  // Update URL params without forcing a scroll or history entry. The
  // page is fully driven by these params on first load, so keeping
  // them in sync makes every moment shareable.
  const syncUrl = useCallback(
    (next: { camera?: CameraPreset; pitch?: number | null }) => {
      const sp = new URLSearchParams(params.toString());
      if (next.camera !== undefined) sp.set("camera", next.camera);
      if (next.pitch !== undefined) {
        if (next.pitch === null) sp.delete("pitch");
        else sp.set("pitch", String(next.pitch));
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const handlePresetChange = (next: CameraPreset) => {
    setPreset(next);
    setPresetTick((t) => t + 1);
    syncUrl({ camera: next });
  };

  const prepared = useMemo<PreparedPitch[]>(
    () =>
      pitches.map((raw) => {
        const pitch = pitchFromReplayRow(raw);
        let path: Array<[number, number, number]> | null = null;
        let flightDuration = 0.4;
        let platePos: [number, number, number] | null = null;
        if (pitch) {
          try {
            path = pitch.path(48);
            flightDuration = pitch.flightDuration() * FLIGHT_TIME_MULTIPLIER;
            const last = path[path.length - 1];
            platePos = statcastToThree(last);
          } catch {
            path = null;
          }
        }
        return { raw, pitch, path, flightDuration, platePos };
      }),
    [pitches],
  );

  // currentIdx ∈ [0, pitches.length). Within a pitch, intraProgress
  // climbs 0 → 1 across the flight; once at 1, it sits at 1 during the
  // post-pitch delay; then advances to the next pitch. Always starts
  // at 0 — even when ?pitch=N is in the URL — so the user gets a full
  // pitch-by-pitch playback rather than landing on a pre-populated
  // scene with all preceding pitches already drawn.
  const [currentIdx, setCurrentIdx] = useState(0);
  const [intraProgress, setIntraProgress] = useState(0);
  const [phase, setPhase] = useState<"flying" | "settled" | "done">("flying");
  const [playing, setPlaying] = useState(true);
  const [followMode, setFollowMode] = useState(false);
  const settledTimerRef = useRef(0);

  // When the user hard-jumps to a pitch, reset animation state.
  // - autoPlay=true (Restart): start at release and animate.
  // - autoPlay=false (prev/next/dot click): show the pitch as
  //   already landed so the cumulative tunnel includes it AND the
  //   metrics overlay surfaces immediately. Without this, manual
  //   stepping leaves the new pitch frozen at progress=0 with
  //   phase=flying, so the user can't tell anything advanced and
  //   the overlay stays hidden behind the detailLanded gate.
  const jumpTo = useCallback(
    (idx: number, autoPlay = true) => {
      const clamped = Math.max(0, Math.min(idx, prepared.length - 1));
      setCurrentIdx(clamped);
      if (autoPlay) {
        setIntraProgress(0);
        setPhase("flying");
      } else {
        setIntraProgress(1);
        setPhase("settled");
      }
      settledTimerRef.current = 0;
      setPlaying(autoPlay);
      // Pitch param uses the AB-relative pitch_number (1-based) so the
      // URL reads as "pitch 3 of this at-bat" not an opaque index.
      const target = prepared[clamped]?.raw.pitch_number;
      syncUrl({ pitch: target ?? null });
    },
    [prepared, syncUrl],
  );

  // Play/pause toggle. If we're already at the end (phase === "done"),
  // Play restarts the at-bat from the first pitch — otherwise the
  // button looks live but does nothing because the driver short-circuits
  // on the done phase.
  const handleTogglePlay = useCallback(() => {
    if (phase === "done") {
      jumpTo(0, true);
      return;
    }
    setPlaying((p) => !p);
  }, [phase, jumpTo]);

  // Keyboard shortcuts: ←/→ step pitches, space play/pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (
        tgt &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.isContentEditable)
      ) {
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        jumpTo(currentIdx + 1, false);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        jumpTo(currentIdx - 1, false);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        jumpTo(0, true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentIdx, jumpTo, handleTogglePlay]);

  const activePitch = prepared[currentIdx];
  const isLast = currentIdx >= prepared.length - 1;
  // Stand is the same for the whole at-bat (one batter); first valid
  // value wins. "L" / "R" only — anything else (rare data nulls)
  // hides the silhouette to avoid guessing.
  const batterStand: "L" | "R" | null = (() => {
    for (const p of prepared) {
      if (p.raw.stand === "L" || p.raw.stand === "R") return p.raw.stand;
    }
    return null;
  })();

  // Front-preset camera angle depends on batter handedness. Shared
  // helper — same logic mirrored on the pitcher page's inline at-bat
  // playback.
  const frontPresetOverride: CameraPosition | null = useMemo(
    () => frontPresetForStand(preset, batterStand),
    [preset, batterStand],
  );

  // Manual selection — when the user clicks a ribbon, we jump there
  // and show the shape-metrics overlay. selectedDetailIdx is what the
  // overlay reads; null = use the active pitch (auto-updates with
  // playback). Click empty space (Scene onPointerMissed) to clear.
  //
  // NOTE: we deliberately don't seed this from the URL's ?pitch=N.
  // Seeding would lock the overlay to the linked pitch and freeze it
  // there as playback advances. The deep-link is for "land here and
  // watch from pitch 1"; the highlight follows playback naturally.
  const [selectedDetailIdx, setSelectedDetailIdx] = useState<number | null>(
    null,
  );
  const detailIdx = selectedDetailIdx ?? currentIdx;
  const detailPitch = prepared[detailIdx];
  // Only surface the metrics overlay once the pitch has actually
  // landed at the plate. While the active pitch is mid-flight, the
  // overlay sits at a position the ball hasn't reached yet, which
  // reads as a spoiler floating in front of the action. Past pitches
  // (idx < currentIdx) are always landed.
  const detailLanded =
    detailIdx < currentIdx || (detailIdx === currentIdx && phase !== "flying");

  const handleSelectPitch = useCallback(
    (idx: number) => {
      setSelectedDetailIdx(idx);
      jumpTo(idx, false);
    },
    [jumpTo],
  );

  return (
    <>
      <Scene
        preset={preset}
        presetTick={presetTick}
        presetOverride={frontPresetOverride}
        onPointerMissed={() => setSelectedDetailIdx(null)}
      >
        <ReplayDriver
          prepared={prepared}
          currentIdx={currentIdx}
          intraProgress={intraProgress}
          phase={phase}
          playing={playing}
          onProgress={setIntraProgress}
          onAdvance={() => {
            if (isLast) {
              setPhase("done");
              setPlaying(false);
            } else {
              setCurrentIdx((i) => i + 1);
              setIntraProgress(0);
              setPhase("flying");
              settledTimerRef.current = 0;
            }
          }}
          onSettle={() => setPhase("settled")}
          settledTimerRef={settledTimerRef}
          onSelectPitch={handleSelectPitch}
          selectedDetailIdx={selectedDetailIdx}
        />
        <CameraFollower
          enabled={followMode}
          activePath={activePitch?.path ?? null}
          progress={intraProgress}
          phase={phase}
        />
        {batterStand ? <BatterSilhouette stand={batterStand} /> : null}
        {/* Outcome chip on every pitch that has already landed (idx <
            currentIdx, plus the active pitch once it's settled). */}
        {prepared.map((p, i) => {
          if (!p.platePos) return null;
          const landed = i < currentIdx || (i === currentIdx && phase !== "flying");
          if (!landed) return null;
          return (
            <PlateChip
              key={`chip-${i}`}
              position={p.platePos}
              pitchNumber={p.raw.pitch_number}
              description={p.raw.description}
              onClick={() => handleSelectPitch(i)}
            />
          );
        })}
        {/* Shape-metrics overlay anchored to the current/selected pitch
            so it auto-updates as playback advances OR locks to a
            user-clicked pitch. Only shown once the pitch has landed —
            we don't want metrics floating ahead of the ball mid-flight.
            Keyed by detailIdx so the overlay cleanly re-mounts at the
            new pitch's position when playback advances; otherwise the
            <Html> portal can hold onto its prior anchor. */}
        {detailPitch?.platePos && detailLanded ? (
          <PitchDetailsPanel
            key={detailIdx}
            position={detailPitch.platePos}
            pitch={detailPitch.raw}
          />
        ) : null}
      </Scene>

      <CameraPad current={preset} onChange={handlePresetChange} />

      <button
        type="button"
        onClick={() => setFollowMode((f) => !f)}
        className={`absolute bottom-20 right-3 sm:right-6 z-20 px-3 py-1.5 rounded text-[10px] uppercase tracking-[0.14em] backdrop-blur-md border transition-colors pointer-events-auto ${
          followMode
            ? "bg-white/15 border-white/25 text-white"
            : "bg-black/35 border-white/15 text-white/65 hover:text-white hover:bg-[#081a32]/80"
        }`}
        aria-pressed={followMode}
        title="Camera tracks the active pitch's ball with a cinematic lag."
      >
        Follow {followMode ? "on" : "off"}
      </button>

      <PitchStepper
        prepared={prepared}
        currentIdx={currentIdx}
        playing={playing}
        phase={phase}
        onJumpTo={jumpTo}
        onTogglePlay={handleTogglePlay}
        activePitch={activePitch}
      />
    </>
  );
}

// Maps a Statcast pitch row into our trajectory model. Returns null
// when any required kinematic field is missing.
function pitchFromReplayRow(row: ReplayPitch): Pitch | null {
  if (
    row.release_pos_x == null ||
    row.release_pos_y == null ||
    row.release_pos_z == null ||
    row.vx0 == null ||
    row.vy0 == null ||
    row.vz0 == null ||
    row.ax == null ||
    row.ay == null ||
    row.az == null ||
    !row.pitch_type
  ) {
    return null;
  }
  const statcast: StatcastRow = {
    release_pos_x: row.release_pos_x,
    release_pos_y: row.release_pos_y,
    release_pos_z: row.release_pos_z,
    vx0: row.vx0,
    vy0: row.vy0,
    vz0: row.vz0,
    ax: row.ax,
    ay: row.ay,
    az: row.az,
    plate_x: row.plate_x ?? 0,
    plate_z: row.plate_z ?? 0,
    release_speed: row.release_speed ?? 0,
    pitch_type: row.pitch_type,
  };
  try {
    return new Pitch(statcast);
  } catch {
    return null;
  }
}

// Drives the per-frame animation state forward. Lives inside the
// Canvas so useFrame works; reads/writes parent state via callbacks.
interface ReplayDriverProps {
  prepared: PreparedPitch[];
  currentIdx: number;
  intraProgress: number;
  phase: "flying" | "settled" | "done";
  playing: boolean;
  onProgress: (p: number) => void;
  onAdvance: () => void;
  onSettle: () => void;
  settledTimerRef: React.MutableRefObject<number>;
  onSelectPitch: (idx: number) => void;
  selectedDetailIdx: number | null;
}

function ReplayDriver({
  prepared,
  currentIdx,
  intraProgress,
  phase,
  playing,
  onProgress,
  onAdvance,
  onSettle,
  settledTimerRef,
  onSelectPitch,
  selectedDetailIdx,
}: ReplayDriverProps) {
  useFrame((_, delta) => {
    if (!playing) return;
    if (phase === "done") return;

    const active = prepared[currentIdx];
    if (!active) return;

    if (phase === "flying") {
      const next = intraProgress + delta / Math.max(0.05, active.flightDuration);
      if (next >= 1) {
        onProgress(1);
        onSettle();
        settledTimerRef.current = 0;
      } else {
        onProgress(next);
      }
      return;
    }

    if (phase === "settled") {
      settledTimerRef.current += delta;
      if (settledTimerRef.current >= POST_PITCH_DELAY_S) {
        onAdvance();
      }
    }
  });

  return (
    <>
      {prepared.map((p, i) => {
        if (!p.path) return null;
        if (i > currentIdx) return null;
        const drawProgress =
          i < currentIdx ? 1 : phase === "flying" ? intraProgress : 1;
        const isFlying = i === currentIdx && phase === "flying";
        const isSelected = selectedDetailIdx === i;
        // Selected pitch reads bolder; others fade slightly so the
        // focus is unambiguous. Default opacity for completed pitches
        // is unchanged when nothing is selected.
        const baseOpacity = i < currentIdx ? 0.55 : 1;
        const opacity =
          selectedDetailIdx == null
            ? baseOpacity
            : isSelected
              ? 1
              : baseOpacity * 0.4;
        const radius = isSelected ? 0.13 : isFlying ? 0.11 : 0.09;
        const outcomeColor =
          OUTCOME_COLORS[categorizeDescription(p.raw.description)];
        return (
          <group key={`pitch-${p.raw.pitch_number}`}>
            <Ribbon
              path={p.path}
              pitchType={p.raw.pitch_type ?? ""}
              radius={radius}
              drawProgress={drawProgress}
              opacity={opacity}
              onClick={(ev) => {
                ev.stopPropagation();
                onSelectPitch(i);
              }}
              onPointerOver={() => {
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "";
              }}
            />
            {/* While flying: white BallTracer animates along the curve.
                After landing: a sphere parked at the plate, colored by
                the pitch's outcome category so the at-bat reads as a
                tunnel pattern with outcome dots at each strand's end. */}
            {isFlying ? (
              <BallTracer path={p.path} progress={drawProgress} />
            ) : p.platePos ? (
              <Sphere
                args={[isSelected ? 0.16 : 0.13, 18, 18]}
                position={p.platePos}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelectPitch(i);
                }}
                onPointerOver={(ev) => {
                  ev.stopPropagation();
                  document.body.style.cursor = "pointer";
                }}
                onPointerOut={() => {
                  document.body.style.cursor = "";
                }}
              >
                <meshStandardMaterial
                  color={outcomeColor}
                  roughness={0.4}
                  metalness={0.05}
                  transparent
                  opacity={opacity}
                  emissive={isSelected ? outcomeColor : "#000000"}
                  emissiveIntensity={isSelected ? 0.6 : 0}
                />
              </Sphere>
            ) : null}
          </group>
        );
      })}
    </>
  );
}

// Camera follow mode: when enabled and a pitch is flying, lerp the
// OrbitControls target toward the current ball position with damping.
// The damping creates the cinematic "lag" the plan calls out — the
// camera doesn't snap to the ball, it eases toward it. Stays out of
// the way once the pitch has landed; the next jump or auto-advance
// resumes the chase.
interface CameraFollowerProps {
  enabled: boolean;
  activePath: Array<[number, number, number]> | null;
  progress: number;
  phase: "flying" | "settled" | "done";
}

// Minimal duck-typed interface for the OrbitControls instance — only
// the surface area the follower touches. Avoids pulling three-stdlib
// types just for two property reads.
interface OrbitTarget {
  target: Vector3;
  update(): void;
}

function CameraFollower({ enabled, activePath, progress, phase }: CameraFollowerProps) {
  const controls = useThree((s) => s.controls) as OrbitTarget | null | undefined;
  const curve = useMemo(() => {
    if (!activePath || activePath.length < 2) return null;
    const points = activePath.map((p) => new Vector3(...statcastToThree(p)));
    return new CatmullRomCurve3(points);
  }, [activePath]);
  const ballPos = useRef(new Vector3());

  useFrame((_, delta) => {
    if (!enabled || !controls || !curve) return;
    if (phase !== "flying") return;
    const t = Math.max(0, Math.min(1, progress));
    curve.getPoint(t, ballPos.current);
    const k = Math.min(1, delta * 1.6);
    controls.target.lerp(ballPos.current, k);
    controls.update();
  });

  return null;
}

// Small floating chip rendered at each landed pitch's plate position.
// Uses outcome color so the at-bat reads as a tunnel pattern with
// outcome dots at the end of each strand.
function PlateChip({
  position,
  pitchNumber,
  description,
  onClick,
}: {
  position: [number, number, number];
  pitchNumber: number;
  description: string | null;
  onClick?: () => void;
}) {
  const cat = categorizeDescription(description);
  const color = OUTCOME_COLORS[cat];
  return (
    <Html position={position} zIndexRange={[10, 0]}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className="px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums shadow cursor-pointer pointer-events-auto"
        style={{
          background: color,
          color: "#0a0e14",
          transform: "translate(8px, -50%)",
          whiteSpace: "nowrap",
        }}
        aria-label={`Show metrics for pitch ${pitchNumber}`}
      >
        #{pitchNumber}
      </button>
    </Html>
  );
}

// Shape-metrics overlay anchored at the selected pitch's plate
// position. Mirrors the compare scene's MetricsPanel — pitch label +
// velo on one floating card, with spin / iVB / HB / axis / extension
// rows on a second card. zIndexRange[10,0] keeps the overlay behind
// the side panel + stepper chrome (which use z-20).
function PitchDetailsPanel({
  position,
  pitch,
}: {
  position: [number, number, number];
  pitch: ReplayPitch;
}) {
  const label = pitch.pitch_type ? getPitchLabel(pitch.pitch_type) : "—";
  const velo = pitch.release_speed != null ? `${Number(pitch.release_speed).toFixed(1)} mph` : null;
  const rows: Array<{ label: string; value: string }> = [];
  if (pitch.release_spin_rate != null) {
    rows.push({ label: "Spin", value: `${Math.round(Number(pitch.release_spin_rate))} rpm` });
  }
  if (pitch.pfx_z != null) {
    rows.push({ label: "iVB", value: formatBreakInches(Number(pitch.pfx_z) * 12) });
  }
  if (pitch.pfx_x != null) {
    rows.push({ label: "HB", value: formatBreakInches(Number(pitch.pfx_x) * 12) });
  }
  if (pitch.spin_axis != null) {
    rows.push({ label: "Axis", value: `${Math.round(Number(pitch.spin_axis))}°` });
  }
  if (pitch.release_extension != null) {
    rows.push({ label: "Ext", value: `${Number(pitch.release_extension).toFixed(1)} ft` });
  }
  return (
    <Html position={position} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div style={{ position: "relative", width: 0, height: 0 }}>
        <div
          className="absolute whitespace-nowrap px-2 py-1 rounded bg-black/80 backdrop-blur-sm border border-white/15 text-xs text-white/95 tabular-nums shadow-lg"
          style={{ left: 0, top: 0, transform: "translate(14px, -120%)" }}
        >
          <span className="font-medium">{label}</span>
          {velo ? <span className="text-white/70 ml-1.5">{velo}</span> : null}
        </div>
        {rows.length > 0 ? (
          <div
            className="absolute whitespace-nowrap px-2 py-1.5 rounded bg-black/80 backdrop-blur-sm border border-white/15 text-[11px] text-white/95 tabular-nums shadow-lg"
            style={{ left: 0, top: 0, transform: "translate(14px, 8%)" }}
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
        ) : null}
      </div>
    </Html>
  );
}

function formatBreakInches(inches: number): string {
  const sign = inches >= 0 ? "+" : "";
  return `${sign}${inches.toFixed(1)}"`;
}

// Bottom-center stepper: per-pitch dots, current count, play/pause +
// step buttons. Inspired by a video transport bar.
interface PitchStepperProps {
  prepared: PreparedPitch[];
  currentIdx: number;
  playing: boolean;
  // Whether the active pitch is mid-flight or already landed/done.
  // Drives the active dot color: white while flying, outcome-colored
  // once it lands (so the final pitch ends up in its outcome color
  // instead of stuck on white forever).
  phase: "flying" | "settled" | "done";
  onJumpTo: (idx: number, autoPlay?: boolean) => void;
  onTogglePlay: () => void;
  activePitch: PreparedPitch | undefined;
}

function PitchStepper({
  prepared,
  currentIdx,
  playing,
  phase,
  onJumpTo,
  onTogglePlay,
  activePitch,
}: PitchStepperProps) {
  const active = activePitch;
  const balls = active?.raw.balls ?? 0;
  const strikes = active?.raw.strikes ?? 0;
  const pitchType = active?.raw.pitch_type ?? "";
  const pitchLabel = pitchType ? getPitchLabel(pitchType) : "—";
  const velocity = active?.raw.release_speed ?? null;

  return (
    // Mobile: dock the stepper flush to the bottom of the pitcher/
    // batter panel. Side panel is fixed h-[11rem] starting at
    // top-16 (4rem) → bottom at 15rem. Stepper at top-[15.5rem]
    // sits with a 0.5rem breathing gap. Keeps the rest of the
    // screen free for the 3D scene.
    // sm+: revert to the canonical bottom-center transport bar.
    <div className="absolute top-[15.5rem] sm:top-auto sm:bottom-6 left-3 right-3 sm:left-1/2 sm:right-auto z-20 sm:-translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto">
      <div className="px-3 py-2 rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-center gap-2 sm:gap-3 text-white/90 flex-wrap max-w-full">
        <button
          type="button"
          onClick={() => onJumpTo(currentIdx - 1, false)}
          disabled={currentIdx <= 0}
          className="px-2 py-1 rounded text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          aria-label="Previous pitch"
        >
          ← prev
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          className="px-3 py-1 rounded text-[11px] uppercase tracking-[0.14em] bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 text-white transition-colors"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => onJumpTo(currentIdx + 1, false)}
          disabled={currentIdx >= prepared.length - 1}
          className="px-2 py-1 rounded text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          aria-label="Next pitch"
        >
          next →
        </button>
        {/* Pitch info: full detail (type + velo + count) on sm+, just
            count on mobile so the row never wraps awkwardly on a
            320px viewport. */}
        <div className="hidden sm:flex border-l border-white/10 pl-3 ml-1 items-center gap-2 text-[11px] tabular-nums">
          <span className="text-white/55">P{(active?.raw.pitch_number ?? 1)}</span>
          <span className="text-white/85">{pitchLabel}</span>
          <span className="text-white/55">
            {velocity != null ? `${velocity.toFixed(1)} mph` : ""}
          </span>
          <span className="border-l border-white/10 pl-2 ml-1 text-white/60">
            {balls}-{strikes}
          </span>
        </div>
        <div className="sm:hidden border-l border-white/10 pl-2 ml-1 flex items-center gap-1 text-[11px] tabular-nums text-white/65">
          <span>P{active?.raw.pitch_number ?? 1}</span>
          <span>·</span>
          <span>{balls}-{strikes}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg">
        {prepared.map((p, i) => {
          // A pitch is "landed" once it's past or sitting at currentIdx
          // with the phase no longer flying — the final pitch hits this
          // case after its animation ends, so it picks up its outcome
          // color instead of staying white.
          const landed =
            i < currentIdx || (i === currentIdx && phase !== "flying");
          const isActiveFlying = i === currentIdx && !landed;
          const cls = landed
            ? dotColorForOutcome(p.raw.description)
            : isActiveFlying
              ? "bg-transparent"
              : "bg-white/30 hover:bg-white/60";
          const symbol = landed ? outcomeSymbol(p.raw.description) : null;
          return (
            <button
              key={`dot-${i}`}
              type="button"
              onClick={() => onJumpTo(i, false)}
              className={`w-5 h-5 rounded-full overflow-hidden transition-colors flex items-center justify-center text-[10px] font-bold leading-none text-white/95 ${cls}`}
              aria-label={`Jump to pitch ${i + 1}`}
            >
              {isActiveFlying ? (
                <BaseballGlyph spinning />
              ) : symbol ? (
                <span
                  aria-hidden
                  // Mirror the K visually for a "looking" (called)
                  // strike — the standard scorebook convention.
                  style={
                    symbol.mirrored
                      ? { transform: "scaleX(-1)", display: "inline-block" }
                      : undefined
                  }
                >
                  {symbol.letter}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Scorebook-style symbol per outcome category, rendered inside the
// stepper dot once the pitch has landed:
//   B   ball
//   K   swinging strike (whiff)
//   ꓘ   called strike (rendered as a mirrored "K" via CSS scaleX(-1))
//   F   foul
//   P   in play
// Other / unknown outcomes get no symbol — the colored dot is the
// signal.
function outcomeSymbol(
  description: string | null,
): { letter: string; mirrored: boolean } | null {
  const cat = categorizeDescription(description);
  switch (cat) {
    case "ball":
      return { letter: "B", mirrored: false };
    case "whiff":
      return { letter: "K", mirrored: false };
    case "called":
      return { letter: "K", mirrored: true };
    case "foul":
      return { letter: "F", mirrored: false };
    case "inplay":
      return { letter: "P", mirrored: false };
    default:
      return null;
  }
}

function dotColorForOutcome(description: string | null): string {
  const cat = categorizeDescription(description);
  switch (cat) {
    case "whiff":
      return "bg-red-500";
    case "called":
      return "bg-amber-500";
    case "ball":
      return "bg-blue-500";
    case "foul":
      return "bg-neutral-400";
    case "inplay":
      return "bg-emerald-500";
    default:
      return "bg-white/40";
  }
}
