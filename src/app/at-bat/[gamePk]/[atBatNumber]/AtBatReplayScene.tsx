"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { CatmullRomCurve3, Vector3 } from "three";
import { Scene } from "@/components/scene/Scene";
import { Ribbon } from "@/components/ribbon/Ribbon";
import { BallTracer } from "@/components/ribbon/BallTracer";
import { CameraPad } from "@/components/controls/CameraPad";
import { Pitch, type StatcastRow } from "@/lib/pitch/Pitch";
import { statcastToThree } from "@/lib/viz/coords";
import { categorizeDescription, OUTCOME_COLORS, getPitchLabel } from "@/lib/viz/colors";
import type { CameraPreset } from "@/lib/viz/camera-presets";

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
  initialPitchIdx: number | null;
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
  initialPitchIdx,
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

  // The clamped, valid initial pitch index (or 0 if none specified).
  const startIdx = initialPitchIdx ?? 0;

  // currentIdx ∈ [0, pitches.length). Within a pitch, intraProgress
  // climbs 0 → 1 across the flight; once at 1, it sits at 1 during the
  // post-pitch delay; then advances to the next pitch.
  const [currentIdx, setCurrentIdx] = useState(startIdx);
  const [intraProgress, setIntraProgress] = useState(0);
  const [phase, setPhase] = useState<"flying" | "settled" | "done">("flying");
  const [playing, setPlaying] = useState(true);
  const [followMode, setFollowMode] = useState(false);
  const settledTimerRef = useRef(0);

  // When the user hard-jumps to a pitch (via the stepper), reset the
  // animation state cleanly. Sync the URL so paused-at-pitch is the
  // shareable artifact.
  const jumpTo = useCallback(
    (idx: number, autoPlay = true) => {
      const clamped = Math.max(0, Math.min(idx, prepared.length - 1));
      setCurrentIdx(clamped);
      setIntraProgress(0);
      setPhase("flying");
      settledTimerRef.current = 0;
      setPlaying(autoPlay);
      // Pitch param uses the AB-relative pitch_number (1-based) so the
      // URL reads as "pitch 3 of this at-bat" not an opaque index.
      const target = prepared[clamped]?.raw.pitch_number;
      syncUrl({ pitch: target ?? null });
    },
    [prepared, syncUrl],
  );

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
        setPlaying((p) => !p);
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
  }, [currentIdx, jumpTo]);

  const activePitch = prepared[currentIdx];
  const isLast = currentIdx >= prepared.length - 1;

  // Manual selection — when the user clicks a ribbon, we jump there
  // and show the shape-metrics overlay. selectedDetailIdx is what the
  // overlay reads; null = use the active pitch (auto-updates with
  // playback). Click empty space (Scene onPointerMissed) to clear.
  const [selectedDetailIdx, setSelectedDetailIdx] = useState<number | null>(null);
  const detailIdx = selectedDetailIdx ?? currentIdx;
  const detailPitch = prepared[detailIdx];

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
            user-clicked pitch. */}
        {detailPitch?.platePos ? (
          <PitchDetailsPanel
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
            : "bg-black/35 border-white/15 text-white/65 hover:text-white hover:bg-black/50"
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
        onJumpTo={jumpTo}
        onTogglePlay={() => setPlaying((p) => !p)}
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
        const isActive = i === currentIdx && phase === "flying";
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
        const radius = isSelected ? 0.13 : isActive ? 0.11 : 0.09;
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
            {/* Show the ball at its final plate position for past pitches
                and the settled current pitch (drawProgress=1), and as a
                live tracer while flying. Balls accumulate across the
                at-bat instead of disappearing on landing. */}
            <BallTracer path={p.path} progress={drawProgress} />
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
  onJumpTo: (idx: number, autoPlay?: boolean) => void;
  onTogglePlay: () => void;
  activePitch: PreparedPitch | undefined;
}

function PitchStepper({
  prepared,
  currentIdx,
  playing,
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
    // Mobile: dock the stepper just below the pitcher/batter panel
    // (top-20 + ~150px content height + small gap = ~15rem). Keeps the
    // bottom half of the screen free for the 3D scene so the strike
    // zone never sits behind chrome.
    // sm+: revert to the canonical bottom-center transport bar.
    <div className="absolute top-[15rem] sm:top-auto sm:bottom-6 left-3 right-3 sm:left-1/2 sm:right-auto z-20 sm:-translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto">
      <div className="px-3 py-2 rounded-lg bg-black/55 backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-center gap-2 sm:gap-3 text-white/90 flex-wrap max-w-full">
        <button
          type="button"
          onClick={() => onJumpTo(0, true)}
          className="p-1.5 rounded text-white/55 hover:text-white hover:bg-white/[0.08] transition-colors"
          aria-label="Restart from first pitch"
          title="Restart"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 9-9" />
            <path d="M3 4v5h5" />
          </svg>
        </button>
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
      <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-full px-2">
        {prepared.map((p, i) => (
          <button
            key={`dot-${i}`}
            type="button"
            onClick={() => onJumpTo(i, false)}
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i === currentIdx
                ? "bg-white"
                : i < currentIdx
                  ? dotColorForOutcome(p.raw.description)
                  : "bg-white/20 hover:bg-white/40"
            }`}
            aria-label={`Jump to pitch ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
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
