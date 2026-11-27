"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PitcherArsenalScene } from "./PitcherArsenalScene";
import { usePitcherView } from "./StatsModeToggle";
import type { ReplayPitch } from "@/app/at-bat/[gamePk]/[atBatNumber]/AtBatReplayScene";

interface CachedPitch {
  game_pk: number;
  at_bat_number: number;
  pitch_number: number;
  pitch_type: string | null;
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
  /** Flattened from pitch_games.game_date on the arsenal endpoint —
   *  drives the recency-based render split in the 3D scene. */
  game_date: string | null;
}

interface ArsenalResponse {
  pitches: CachedPitch[];
  pitcherLabel: string;
}

interface AtBatPitchesResponse {
  pitches: ReplayPitch[];
}

// Persistent client-side Scene shell. Lives in /pitcher/layout.tsx
// (which Next.js preserves across [id] route changes), so when the
// user picks a different pitcher from the search input the WebGL
// canvas stays mounted, the camera state is preserved, and only the
// pitch ribbons + pitcher label cross-fade in via prop change.
//
// Two fetch streams:
//   - Arsenal: pitcher × season × side filters → renderable pitches
//     for arsenal mode.
//   - At-bat:  ?abGame=N&abNum=M → that single AB's pitches for
//     inline at-bat playback. When set, the Scene swaps into
//     playback mode without remounting; arsenal data is kept warm
//     so leaving at-bat mode is instantaneous.
export function ArsenalSceneShell() {
  const params = useParams<{ id?: string }>();
  const searchParams = useSearchParams();
  const [view] = usePitcherView();
  const id = params?.id;

  // Strip at-bat-replay params from the arsenal fetch — they drive
  // the playback overlay, not the underlying arsenal pitch set.
  // ?vsBatter STAYS in the query so the 3D scene narrows to the
  // batter scope when one is selected — otherwise the filter-summary
  // banner reads "All pitches vs <batter>" while the canvas is still
  // showing the whole season's arsenal.
  const arsenalQuery = (() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("abGame");
    sp.delete("abNum");
    sp.delete("batterQ");
    return sp.toString();
  })();

  const abGame = searchParams.get("abGame");
  const abNum = searchParams.get("abNum");
  const inAtBatMode = abGame != null && abNum != null;

  const [arsenal, setArsenal] = useState<ArsenalResponse>({
    pitches: [],
    pitcherLabel: "",
  });
  const [atBatPitches, setAtBatPitches] = useState<ReplayPitch[] | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const url = `/api/pitcher/${id}/arsenal${arsenalQuery ? `?${arsenalQuery}` : ""}`;
    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Arsenal fetch ${res.status}`);
        const body = (await res.json()) as ArsenalResponse;
        if (cancelled) return;
        setArsenal(body);
      })
      .catch(() => {
        // Ignore — leaves prior arsenal state in place. Panel above
        // will surface user-facing errors via the page route's
        // notFound for missing pitchers.
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [id, arsenalQuery]);

  // Fetch the at-bat's pitches when the URL flips into at-bat mode.
  // Clear them when the URL leaves at-bat mode so a stale playback
  // doesn't render after the user exits.
  useEffect(() => {
    if (!inAtBatMode || !abGame || !abNum) {
      // eslint-disable-next-line
      setAtBatPitches(null);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    fetch(`/api/at-bat/${abGame}/${abNum}/pitches`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`At-bat pitches fetch ${res.status}`);
        const body = (await res.json()) as AtBatPitchesResponse;
        if (cancelled) return;
        setAtBatPitches(body.pitches ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setAtBatPitches([]);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [inAtBatMode, abGame, abNum]);

  if (!id) return null;
  // Stats mode: drop the entire scene tree. Returning null unmounts
  // the <Canvas>, releases the WebGL context, and frees the GPU
  // while the user reads charts.
  if (view === "stats") return null;

  return (
    <PitcherArsenalScene
      pitches={arsenal.pitches}
      pitcherLabel={arsenal.pitcherLabel}
      atBatPitches={atBatPitches}
    />
  );
}
