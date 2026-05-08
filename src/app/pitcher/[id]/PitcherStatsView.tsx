"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { aggregate, type StatPitch } from "./stats/aggregations";
import { LazyMount } from "./stats/LazyMount";
import { StatsHeadline } from "./stats/StatsHeadline";
import { PerPitchTable } from "./stats/PerPitchTable";
import { MovementPlot } from "./stats/MovementPlot";
import { VelocityHistograms } from "./stats/VelocityHistograms";
import { ReleaseCluster } from "./stats/ReleaseCluster";
import { HeatMapGrid } from "./stats/HeatMapGrid";
import { VAABars } from "./stats/VAABars";

// Top-level Stats view. Fetches the same arsenal payload the 3D
// scene shell uses (browser cache dedups), aggregates client-side
// via the pure-function module, and stacks the analytic cards.
//
// Headline + per-pitch table render on first paint. Every chart
// below is wrapped in <LazyMount> so the SVG mounts only when it
// scrolls into view — keeps first paint fast on phones without
// hiding content behind tabs.
export function PitcherStatsView() {
  const params = useParams<{ id?: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;

  // Build a query that mirrors the arsenal-shell stripping (drop the
  // at-bat-mode params + view) so the cache hit is identical.
  const arsenalQuery = (() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("abGame");
    sp.delete("abNum");
    sp.delete("vsBatter");
    sp.delete("batterQ");
    sp.delete("view");
    return sp.toString();
  })();

  const [pitches, setPitches] = useState<StatPitch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(
      `/api/pitcher/${id}/arsenal${arsenalQuery ? `?${arsenalQuery}` : ""}`,
      { signal: ctrl.signal },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`Arsenal fetch ${res.status}`);
        const body = (await res.json()) as { pitches: StatPitch[] };
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
  }, [id, arsenalQuery]);

  const aggregated = useMemo(() => aggregate(pitches), [pitches]);

  if (loading && pitches.length === 0) {
    return (
      <div className="text-[11px] text-white/55 italic px-1 py-3">
        Loading stats…
      </div>
    );
  }

  if (pitches.length === 0) {
    return (
      <div className="text-[11px] text-white/55 italic px-1 py-3">
        No pitches in the current filter.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <StatsHeadline total={aggregated.total} />
      <PerPitchTable rows={aggregated.perPitch} />
      <LazyMount minHeight={340}>
        <MovementPlot pitches={pitches} />
      </LazyMount>
      <LazyMount minHeight={260}>
        <VelocityHistograms pitches={pitches} perPitch={aggregated.perPitch} />
      </LazyMount>
      <LazyMount minHeight={340}>
        <ReleaseCluster pitches={pitches} />
      </LazyMount>
      <LazyMount minHeight={300}>
        <HeatMapGrid pitches={pitches} perPitch={aggregated.perPitch} />
      </LazyMount>
      <LazyMount minHeight={220}>
        <VAABars rows={aggregated.perPitch} />
      </LazyMount>
    </div>
  );
}
