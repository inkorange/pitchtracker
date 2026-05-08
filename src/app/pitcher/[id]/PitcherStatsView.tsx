"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PitcherFilters } from "@/components/filters/PitcherFilters";
import { aggregate, type StatPitch } from "./stats/aggregations";
import { LazyMount } from "./stats/LazyMount";
import { StatsHeadline } from "./stats/StatsHeadline";
import { PerPitchTable } from "./stats/PerPitchTable";
import { MovementPlot } from "./stats/MovementPlot";
import { VelocityHistograms } from "./stats/VelocityHistograms";
import { ReleaseCluster } from "./stats/ReleaseCluster";
import { HeatMapGrid } from "./stats/HeatMapGrid";
import { VAABars } from "./stats/VAABars";

interface ArsenalEntry {
  pitch_type: string;
  pitch_count: number | null;
}
interface GameEntry {
  game_pk: number;
  game_date: string;
  away: string;
  home: string;
}

// Top-level Stats view. Fetches the same arsenal payload the 3D
// scene shell uses (browser cache dedups), aggregates client-side
// via the pure-function module, and stacks the analytic cards.
//
// Filters live at the top so the user has them in context — pitch
// type, outcome, hand, and game all flow into the same `?` URL
// params the 3D scene reads, so toggling here narrows the analytics
// data immediately.
//
// Headline + per-pitch table render on first paint. Every chart
// below is wrapped in <LazyMount> so the SVG mounts only when it
// scrolls into view — keeps first paint fast on phones without
// hiding content behind tabs.
export function PitcherStatsView({
  arsenal,
  games,
  season,
}: {
  arsenal: ArsenalEntry[];
  games: GameEntry[];
  season: number;
}) {
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
      {/* Filter card — same controls as the arsenal-mode pitcher
          panel, but rendered with the analytics rather than tucked
          inside the (compact) pitcher card on mobile. */}
      <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4">
        <PitcherFilters arsenal={arsenal} games={games} season={season} />
      </div>
      {/* Headline spans full width on every breakpoint. */}
      <StatsHeadline total={aggregated.total} />
      {/* 2-col grid only at lg+ (1024px+). Below that, every card
          stacks single-column so the small-multiples (velocity
          histograms, heat maps) don't get cramped at narrow desktop
          widths. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
    </div>
  );
}
