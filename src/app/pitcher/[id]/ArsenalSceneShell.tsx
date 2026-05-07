"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PitcherArsenalScene } from "./PitcherArsenalScene";

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

interface ArsenalResponse {
  pitches: CachedPitch[];
  pitcherLabel: string;
}

// Persistent client-side Scene shell. Lives in /pitcher/layout.tsx
// (which Next.js preserves across [id] route changes), so when the
// user picks a different pitcher from the search input the WebGL
// canvas stays mounted, the camera state is preserved, and only the
// pitch ribbons + pitcher label cross-fade in via prop change. The
// alternative — letting the server-rendered page.tsx own the Scene —
// re-creates the entire Three.js scene on every URL change.
//
// The shell reads the same URL params page.tsx reads (id, season,
// hand, game, pitch, outcome) and pulls renderable pitches from
// /api/pitcher/[id]/arsenal, which mirrors the inline filter logic
// page.tsx applied before passing pitches to the Scene.
export function ArsenalSceneShell() {
  const params = useParams<{ id?: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;
  const queryString = searchParams.toString();

  const [data, setData] = useState<ArsenalResponse>({
    pitches: [],
    pitcherLabel: "",
  });
  const [error, setError] = useState<string | null>(null);

  // Re-fetch whenever the pitcher id or filter params change. The
  // Scene below stays mounted through the swap.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const url = `/api/pitcher/${id}/arsenal${queryString ? `?${queryString}` : ""}`;
    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Arsenal fetch ${res.status}`);
        const body = (await res.json()) as ArsenalResponse;
        if (cancelled) return;
        setData(body);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [id, queryString]);

  if (!id) return null;

  // Errors render minimally; the panel content above will surface
  // a 404 if the pitcher is invalid.
  if (error) {
    return null;
  }

  return (
    <PitcherArsenalScene
      pitches={data.pitches}
      pitcherLabel={data.pitcherLabel}
    />
  );
}
