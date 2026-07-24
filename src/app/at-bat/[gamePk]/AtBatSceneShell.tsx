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

  // `?shot=hero` puts the scene in screenshot mode: a static, well-
  // framed still that renders even in a headless/unfocused tab. Used by
  // the automated social-share capture (and OG image) pipeline.
  const screenshotMode = searchParams.get("shot") === "hero";

  const [pitches, setPitches] = useState<ReplayPitch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gamePk || !atBatNumber) return;
    let cancelled = false;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
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
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
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

  if (pitches.length === 0) {
    // Visible feedback while the client-side fetch is in flight, and
    // a graceful "no data" landing if the AB simply has no cached
    // pitches yet. Sits centered in the layout's fixed-inset main.
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-3 px-4 py-2 rounded-md bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg pointer-events-auto">
          <span
            className="inline-block w-2 h-2 rounded-full bg-white/60 animate-pulse"
            aria-hidden
          />
          <span className="text-[11px] uppercase tracking-[0.16em] text-white/85">
            {loading ? "Loading at-bat…" : "No pitch data"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <AtBatReplayScene
      pitches={pitches}
      initialCamera={initialCamera}
      initialHighlightIdx={initialHighlightIdx}
      screenshotMode={screenshotMode}
    />
  );
}
