"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  AtBatReplayScene,
  type ReplayPitch,
} from "./[atBatNumber]/AtBatReplayScene";
import type { CameraPreset } from "@/lib/viz/camera-presets";

const VALID_PRESETS: CameraPreset[] = ["front", "back", "top", "side"];

// Persistent WebGL shell for the at-bat replay routes. Lives in
// /at-bat/[gamePk]/layout.tsx so Next.js keeps the Canvas mounted as
// the user clicks between [atBatNumber] segments — no GPU teardown,
// no scene rebuild, just a pitches re-fetch.
//
// Reads the active route via useParams; route changes within the same
// gamePk trigger a refetch of the new AB's pitches and AtBatReplayScene
// re-receives them as a prop. The Scene's internal playback state
// resets via its prop-derived state pattern.
export function AtBatSceneShell() {
  const params = useParams<{ gamePk?: string; atBatNumber?: string }>();
  const searchParams = useSearchParams();
  const gamePk = params?.gamePk;
  const atBatNumber = params?.atBatNumber;

  // Initial camera + pitch highlight from URL — same params the
  // server route used to read.
  const cameraParam = searchParams.get("camera");
  const initialCamera: CameraPreset = VALID_PRESETS.includes(
    cameraParam as CameraPreset,
  )
    ? (cameraParam as CameraPreset)
    : "front";

  const [pitches, setPitches] = useState<ReplayPitch[]>([]);

  useEffect(() => {
    if (!gamePk || !atBatNumber) return;
    let cancelled = false;
    const ctrl = new AbortController();
    fetch(`/api/at-bat/${gamePk}/${atBatNumber}/pitches`, {
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`pitches fetch ${res.status}`);
        const body = (await res.json()) as { pitches: ReplayPitch[] };
        if (cancelled) return;
        setPitches(body.pitches ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setPitches([]);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [gamePk, atBatNumber]);

  // Resolve initialHighlightIdx from ?pitch only after pitches load —
  // the index depends on the pitch_number ↔ array-index mapping.
  const pitchParam = searchParams.get("pitch");
  const initialHighlightIdx = (() => {
    if (!pitchParam) return null;
    const n = Number(pitchParam);
    if (!Number.isFinite(n)) return null;
    const idx = pitches.findIndex((p) => p.pitch_number === n);
    return idx === -1 ? null : idx;
  })();

  if (!gamePk || !atBatNumber) return null;
  if (pitches.length === 0) return null;

  return (
    <AtBatReplayScene
      pitches={pitches}
      initialCamera={initialCamera}
      initialHighlightIdx={initialHighlightIdx}
    />
  );
}
