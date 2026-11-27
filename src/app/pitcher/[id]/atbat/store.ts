"use client";

import { useSyncExternalStore } from "react";
import type { ReplayPitch } from "@/app/at-bat/[gamePk]/[atBatNumber]/AtBatReplayScene";

// Bridge between the at-bat playback (owned by the 3D scene, which lives
// in /pitcher/layout.tsx so the canvas survives navigation) and the
// page's at-bat chrome (rail pitch list, score bug, zone inset, mobile
// pitch cards and transport). The scene publishes a coarse snapshot —
// current pitch, landed or not, playing — never per-frame progress, and
// registers its commands; the chrome reads the snapshot and calls them.

export interface AtBatSnapshot {
  /** Playable pitches, in order; indexes match the playback's. */
  pitches: ReplayPitch[];
  currentIdx: number;
  /** The current pitch has reached the plate. */
  landed: boolean;
  playing: boolean;
  done: boolean;
  speed: number;
}

const EMPTY: AtBatSnapshot = { pitches: [], currentIdx: 0, landed: false, playing: false, done: false, speed: 1 };

let snapshot: AtBatSnapshot = EMPTY;
const listeners = new Set<() => void>();

export function publishAtBat(next: AtBatSnapshot | null) {
  const s = next ?? EMPTY;
  if (
    s.pitches === snapshot.pitches &&
    s.currentIdx === snapshot.currentIdx &&
    s.landed === snapshot.landed &&
    s.playing === snapshot.playing &&
    s.done === snapshot.done &&
    s.speed === snapshot.speed
  ) {
    return;
  }
  snapshot = s;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useAtBatSnapshot(): AtBatSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

export interface AtBatCommands {
  /** autoPlay=false lands the pitch immediately and pauses. */
  jumpTo: (idx: number, autoPlay?: boolean) => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
}

let commands: AtBatCommands | null = null;

export function registerAtBatCommands(c: AtBatCommands) {
  commands = c;
  return () => {
    if (commands === c) commands = null;
  };
}

export const SPEEDS = [0.5, 1, 2] as const;

export const atBat = {
  jumpTo: (idx: number, autoPlay = false) => commands?.jumpTo(idx, autoPlay),
  togglePlay: () => commands?.togglePlay(),
  setSpeed: (s: number) => commands?.setSpeed(s),
  /** Step one pitch back/forward, landing it and pausing. */
  step: (dir: -1 | 1) => {
    const { currentIdx, pitches } = snapshot;
    const next = Math.max(0, Math.min(currentIdx + dir, pitches.length - 1));
    commands?.jumpTo(next, false);
  },
  cycleSpeed: () => {
    const i = SPEEDS.indexOf(snapshot.speed as (typeof SPEEDS)[number]);
    commands?.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  },
};

/** ←/→ step pitches, Space plays/pauses. Attach to a scoped element's onKeyDown. */
export function atBatKeyHandler(e: React.KeyboardEvent) {
  if (e.altKey || e.metaKey || e.ctrlKey) return;
  const t = e.target as HTMLElement;
  if (t.closest("input, textarea, select, [contenteditable=true]")) return;
  if (e.key === "ArrowLeft") atBat.step(-1);
  else if (e.key === "ArrowRight") atBat.step(1);
  else if (e.key === " " && !(t instanceof HTMLButtonElement)) atBat.togglePlay();
  else return;
  e.preventDefault();
}
