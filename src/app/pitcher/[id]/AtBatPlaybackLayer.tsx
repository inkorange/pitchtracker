"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Sphere } from "@react-three/drei";
import { Pitch, type StatcastRow } from "@/lib/pitch/Pitch";
import { Ribbon } from "@/components/ribbon/Ribbon";
import { BallTracer } from "@/components/ribbon/BallTracer";
import { BaseballGlyph } from "@/components/icons/BaseballGlyph";
import { statcastToThree } from "@/lib/viz/coords";
import {
  categorizeDescription,
  getPitchLabel,
  OUTCOME_COLORS,
} from "@/lib/viz/colors";
import type { ReplayPitch } from "@/app/at-bat/[gamePk]/[atBatNumber]/AtBatReplayScene";

// In-page at-bat playback for the pitcher view. Mirrors the
// rendering shape of the at-bat replay page (progressive ribbon
// draw, ball tracer on the active pitch, accumulating tunnel of
// landed pitches) without owning page chrome — just the Scene-child
// + a sibling transport bar. Both share state via the
// useAtBatPlayback hook so PitcherArsenalScene can lift them as
// peers.

interface PreparedPitch {
  raw: ReplayPitch;
  path: Array<[number, number, number]>;
  flightDuration: number;
  platePos: [number, number, number];
}

const POST_PITCH_DELAY_S = 1.4;
const FLIGHT_TIME_MULTIPLIER = 2.5;

function pitchFromRow(row: ReplayPitch): Pitch | null {
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
  const stat: StatcastRow = {
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
    return new Pitch(stat);
  } catch {
    return null;
  }
}

function prepare(rows: ReplayPitch[]): PreparedPitch[] {
  const out: PreparedPitch[] = [];
  for (const raw of rows) {
    const pitch = pitchFromRow(raw);
    if (!pitch) continue;
    try {
      const path = pitch.path(48);
      const last = path[path.length - 1];
      out.push({
        raw,
        path,
        flightDuration: pitch.flightDuration() * FLIGHT_TIME_MULTIPLIER,
        platePos: statcastToThree(last),
      });
    } catch {
      // Skip rows that can't compute a path.
    }
  }
  return out;
}

type Phase = "flying" | "settled" | "done";

interface PlaybackState {
  prepared: PreparedPitch[];
  currentIdx: number;
  intraProgress: number;
  phase: Phase;
  playing: boolean;
  selectedDetailIdx: number | null;
}

interface PlaybackHandlers {
  jumpTo: (idx: number, autoPlay?: boolean) => void;
  togglePlay: () => void;
  setIntraProgress: (p: number) => void;
  setPhase: (p: Phase) => void;
  selectPitch: (idx: number) => void;
  clearSelection: () => void;
  settledTimerRef: React.MutableRefObject<number>;
}

/**
 * Centralized state + handlers for inline at-bat playback. Accepts
 * `null` for "not in at-bat mode" so the caller can pass the prop
 * straight through without allocating a new `[]` literal each render
 * (which would churn the useMemo identity below and trigger the
 * prev-prop reset on every render → infinite re-render loop).
 */
export function useAtBatPlayback(pitches: ReplayPitch[] | null): {
  state: PlaybackState;
  handlers: PlaybackHandlers;
} {
  const prepared = useMemo(() => prepare(pitches ?? []), [pitches]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [intraProgress, setIntraProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("flying");
  const [playing, setPlaying] = useState(true);
  // User-pinned pitch for the metrics overlay. Null = follow the
  // active pitch. Set by clicking a ribbon or landed ball; cleared by
  // clicking empty space (wired in PitcherArsenalScene).
  const [selectedDetailIdx, setSelectedDetailIdx] = useState<number | null>(
    null,
  );
  const settledTimerRef = useRef(0);

  // Reset playback to the first pitch whenever the source list flips
  // identity (the user picked a different at-bat). The "store
  // previous prop in useState + setState-during-render-on-mismatch"
  // pattern is React's documented idiom for prop-derived resets and
  // sidesteps the React Compiler's setState-in-effect warning.
  const [prevPrepared, setPrevPrepared] = useState(prepared);
  if (prevPrepared !== prepared) {
    setPrevPrepared(prepared);
    setCurrentIdx(0);
    setIntraProgress(0);
    setPhase("flying");
    setPlaying(true);
    setSelectedDetailIdx(null);
    // The ref write happens during render here, which the React
    // Compiler flags. It's safe — settledTimerRef is private to this
    // hook and the value is consumed only inside useFrame on
    // subsequent renders. Disabled inline.
    // eslint-disable-next-line
    settledTimerRef.current = 0;
  }

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
    },
    [prepared.length],
  );

  const togglePlay = useCallback(() => {
    if (phase === "done") {
      // Restart from the top.
      setCurrentIdx(0);
      setIntraProgress(0);
      setPhase("flying");
      settledTimerRef.current = 0;
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }, [phase]);

  // Click-to-focus: pin the metrics overlay to the picked pitch and
  // pause so the user can inspect it. Crucially, we don't touch
  // currentIdx / phase / intraProgress — clicking pitch 2 of a fully
  // landed at-bat shouldn't unwind playback and hide pitches 3-5;
  // every pitch that was already on screen stays on screen.
  const selectPitch = useCallback((idx: number) => {
    setSelectedDetailIdx(idx);
    setPlaying(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedDetailIdx(null);
  }, []);

  return {
    state: {
      prepared,
      currentIdx,
      intraProgress,
      phase,
      playing,
      selectedDetailIdx,
    },
    handlers: {
      jumpTo,
      togglePlay,
      setIntraProgress,
      setPhase,
      selectPitch,
      clearSelection,
      settledTimerRef,
    },
  };
}

// ─── Scene child ─────────────────────────────────────────────────
interface AtBatPlaybackLayerProps {
  state: PlaybackState;
  handlers: PlaybackHandlers;
}

export function AtBatPlaybackLayer({ state, handlers }: AtBatPlaybackLayerProps) {
  const { prepared, currentIdx, intraProgress, phase, playing, selectedDetailIdx } = state;
  const { setIntraProgress, setPhase, selectPitch, settledTimerRef } = handlers;

  // Animation tick — same shape as AtBatReplayScene's ReplayDriver.
  // Advances intraProgress while flying, settles to the next pitch
  // after a short pause once the active pitch lands. jumpTo is
  // captured fresh per render via a ref so the useFrame closure
  // always sees the latest reference even if it changes.
  const setCurrentIdxRef = useRef(handlers.jumpTo);
  // eslint-disable-next-line
  setCurrentIdxRef.current = handlers.jumpTo;

  useFrame((_, delta) => {
    if (!playing || phase === "done") return;
    const active = prepared[currentIdx];
    if (!active) return;
    if (phase === "flying") {
      const next = intraProgress + delta / Math.max(0.05, active.flightDuration);
      if (next >= 1) {
        setIntraProgress(1);
        setPhase("settled");
        settledTimerRef.current = 0;
      } else {
        setIntraProgress(next);
      }
      return;
    }
    if (phase === "settled") {
      settledTimerRef.current += delta;
      if (settledTimerRef.current >= POST_PITCH_DELAY_S) {
        if (currentIdx >= prepared.length - 1) {
          setPhase("done");
        } else {
          setCurrentIdxRef.current(currentIdx + 1, true);
        }
      }
    }
  });

  // Click-to-focus: detail overlay anchors to the user-selected pitch
  // when one is set, otherwise follows the active pitch as playback
  // advances. detailLanded gates the overlay so it never floats ahead
  // of a still-flying ball.
  const detailIdx = selectedDetailIdx ?? currentIdx;
  const detailPitch = prepared[detailIdx];
  const detailLanded =
    detailIdx < currentIdx || (detailIdx === currentIdx && phase !== "flying");

  return (
    <>
      {prepared.map((p, i) => {
        if (i > currentIdx) return null;
        const drawProgress =
          i < currentIdx ? 1 : phase === "flying" ? intraProgress : 1;
        const isFlying = i === currentIdx && phase === "flying";
        const landed = !isFlying;
        const isSelected = selectedDetailIdx === i;
        const opacity = i < currentIdx ? 0.55 : 1;
        const outcomeColor =
          OUTCOME_COLORS[categorizeDescription(p.raw.description)];
        return (
          <group key={`${p.raw.game_pk}-${p.raw.at_bat_number}-${p.raw.pitch_number}`}>
            <Ribbon
              path={p.path}
              pitchType={p.raw.pitch_type ?? ""}
              radius={isSelected ? 0.13 : isFlying ? 0.11 : 0.09}
              drawProgress={drawProgress}
              opacity={opacity}
              onClick={(ev) => {
                ev.stopPropagation();
                selectPitch(i);
              }}
              onPointerOver={() => {
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "";
              }}
            />
            {/* While flying: white BallTracer animates along the curve.
                Once landed: a sphere parked at the plate, colored by
                outcome (red = whiff, amber = called, blue = ball,
                neutral = foul, emerald = in-play). Mirrors the
                dedicated at-bat replay scene. */}
            {isFlying ? (
              <BallTracer path={p.path} progress={drawProgress} />
            ) : (
              <Sphere
                args={[isSelected ? 0.16 : 0.13, 18, 18]}
                position={p.platePos}
                onClick={(ev) => {
                  ev.stopPropagation();
                  selectPitch(i);
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
            )}
            {landed ? (
              <PlateChip
                position={p.platePos}
                pitchNumber={p.raw.pitch_number}
                description={p.raw.description}
              />
            ) : null}
          </group>
        );
      })}
      {/* Metrics overlay anchored to the focused pitch — selected
          (clicked) when set, otherwise the active pitch as playback
          advances. Re-keyed so the <Html> portal cleanly re-anchors
          when the focus changes. */}
      {detailPitch && detailLanded ? (
        <PitchDetailsPanel
          key={detailIdx}
          position={detailPitch.platePos}
          pitch={detailPitch.raw}
        />
      ) : null}
    </>
  );
}

// Small floating chip at each landed pitch's plate position. Pulls the
// outcome color so a finished at-bat reads as a tunnel of strands
// each ending in its own outcome dot.
function PlateChip({
  position,
  pitchNumber,
  description,
}: {
  position: [number, number, number];
  pitchNumber: number;
  description: string | null;
}) {
  const cat = categorizeDescription(description);
  const color = OUTCOME_COLORS[cat];
  return (
    <Html position={position} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div
        className="px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums shadow"
        style={{
          background: color,
          color: "#0a0e14",
          transform: "translate(8px, -50%)",
          whiteSpace: "nowrap",
        }}
      >
        #{pitchNumber}
      </div>
    </Html>
  );
}

// Pitch label + velo on top, spin / iVB / HB / axis / extension below
// — same shape as the dedicated replay scene's PitchDetailsPanel. Only
// rendered once the active pitch has landed so the card doesn't run
// ahead of the ball mid-flight.
function PitchDetailsPanel({
  position,
  pitch,
}: {
  position: [number, number, number];
  pitch: ReplayPitch;
}) {
  const label = pitch.pitch_type ? getPitchLabel(pitch.pitch_type) : "—";
  const velo =
    pitch.release_speed != null
      ? `${Number(pitch.release_speed).toFixed(1)} mph`
      : null;
  const rows: Array<{ label: string; value: string }> = [];
  if (pitch.release_spin_rate != null) {
    rows.push({
      label: "Spin",
      value: `${Math.round(Number(pitch.release_spin_rate))} rpm`,
    });
  }
  if (pitch.pfx_z != null) {
    rows.push({ label: "iVB", value: formatBreakInches(Number(pitch.pfx_z) * 12) });
  }
  if (pitch.pfx_x != null) {
    rows.push({ label: "HB", value: formatBreakInches(Number(pitch.pfx_x) * 12) });
  }
  if (pitch.spin_axis != null) {
    rows.push({
      label: "Axis",
      value: `${Math.round(Number(pitch.spin_axis))}°`,
    });
  }
  if (pitch.release_extension != null) {
    rows.push({
      label: "Ext",
      value: `${Number(pitch.release_extension).toFixed(1)} ft`,
    });
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

// ─── Transport bar ───────────────────────────────────────────────
interface AtBatPlaybackBarProps {
  state: PlaybackState;
  handlers: PlaybackHandlers;
}

export function AtBatPlaybackBar({ state, handlers }: AtBatPlaybackBarProps) {
  const { prepared, currentIdx, phase, playing } = state;
  const { jumpTo, togglePlay } = handlers;
  const active = prepared[currentIdx];
  const balls = active?.raw.balls ?? 0;
  const strikes = active?.raw.strikes ?? 0;
  const pitchType = active?.raw.pitch_type ?? "";
  const pitchLabel = pitchType ? getPitchLabel(pitchType) : "—";
  const velocity = active?.raw.release_speed ?? null;

  if (prepared.length === 0) return null;

  return (
    // Mobile: pin above the CameraPad (bottom-6 right-3) so the two
    // don't overlap. Desktop: classic bottom-center transport.
    <div className="absolute bottom-20 sm:bottom-6 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-20 flex flex-col items-center gap-2 pointer-events-auto">
      <div className="px-3 py-2 rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-center gap-2 sm:gap-3 text-white/90 flex-wrap max-w-full">
        <button
          type="button"
          onClick={() => jumpTo(currentIdx - 1, false)}
          disabled={currentIdx <= 0}
          className="px-2 py-1 rounded text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          aria-label="Previous pitch"
        >
          ← prev
        </button>
        <button
          type="button"
          onClick={togglePlay}
          className="px-3 py-1 rounded text-[11px] uppercase tracking-[0.14em] bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 text-white transition-colors"
        >
          {phase === "done" ? "Replay" : playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => jumpTo(currentIdx + 1, false)}
          disabled={currentIdx >= prepared.length - 1}
          className="px-2 py-1 rounded text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          aria-label="Next pitch"
        >
          next →
        </button>
        <div className="hidden sm:flex border-l border-white/10 pl-3 ml-1 items-center gap-2 text-[11px] tabular-nums">
          <span className="text-white/55">P{active?.raw.pitch_number ?? 1}</span>
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
          <span>
            {balls}-{strikes}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg">
        {prepared.map((p, i) => {
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
              onClick={() => jumpTo(i, false)}
              className={`w-5 h-5 rounded-full overflow-hidden transition-colors flex items-center justify-center text-[10px] font-bold leading-none text-white/95 ${cls}`}
              aria-label={`Jump to pitch ${i + 1}`}
            >
              {isActiveFlying ? (
                <BaseballGlyph spinning />
              ) : symbol ? (
                <span
                  aria-hidden
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
  // Tailwind-class strings rather than direct color literals so the
  // dot picks up the same outcome palette as OUTCOME_COLORS at runtime
  // even though we pass them as bg-* utilities.
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
      return "bg-white/30";
  }
}

