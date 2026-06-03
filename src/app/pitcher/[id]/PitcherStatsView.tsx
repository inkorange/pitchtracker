"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { parseAsInteger, useQueryStates } from "nuqs";
import { aggregate, type StatPitch } from "./stats/aggregations";
import { LazyMount } from "./stats/LazyMount";
import { StatsHeadline } from "./stats/StatsHeadline";
import { StatsScopeBanner } from "./stats/StatsScopeBanner";
import { ArsenalCard } from "./stats/ArsenalCard";
import { MovementPlot } from "./stats/MovementPlot";
import { VelocityHistograms } from "./stats/VelocityHistograms";
import { ReleaseCluster } from "./stats/ReleaseCluster";
import { HeatMapGrid } from "./stats/HeatMapGrid";
import { VAABars } from "./stats/VAABars";
import { SequencingMatrix } from "./stats/SequencingMatrix";
import { SequencingDrift } from "./stats/SequencingDrift";
import type { SequencingMatrix as SequencingMatrixData } from "@/lib/pitch/sequencingMatrix";
import type { SequencingDrift as SequencingDriftData } from "@/lib/pitch/sequencingDrift";
import type { ArsenalRadar as ArsenalRadarData } from "@/lib/pitch/arsenalRadar";

// Top-level Stats view. Fetches the same arsenal payload the 3D
// scene shell uses (browser cache dedups), aggregates client-side
// via the pure-function module, and stacks the analytic cards.
//
// Filters live in the pitcher card body (same as arsenal mode) — the
// user expands the card to use them, collapses to read the cards.
//
// Headline + per-pitch table render on first paint. Every chart
// below is wrapped in <LazyMount> so the SVG mounts only when it
// scrolls into view — keeps first paint fast on phones without
// hiding content behind tabs.
export function PitcherStatsView({
  filterSummary,
}: {
  /** Pre-rendered scope text from the page server. Mirrors the
   *  TopNav title so the banner reflects every active URL filter
   *  (game / pitch / outcome / event / hand / velo / batter /
   *  at-bat), not just season + vsBatter. */
  filterSummary: string;
}) {
  const params = useParams<{ id?: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;
  // We still read vsBatter so the banner's Clear action can drop
  // it (and at-bat playback) in one click. shallow:false so the URL
  // write triggers a server re-render — the page server reads
  // vsBatter to scope the pitcher card's per-pitch aggregates AND
  // it owns filterSummary text; without this, clearing the batter
  // would leave both stale.
  const [, setUrl] = useQueryStates(
    {
      vsBatter: parseAsInteger,
      // Clearing batter scope also leaves at-bat mode — otherwise the
      // AtBatHeader / inline matchups list would be stranded without
      // a batter context.
      abGame: parseAsInteger,
      abNum: parseAsInteger,
    },
    { shallow: false },
  );
  const vsBatterStr = searchParams.get("vsBatter");
  const vsBatter =
    vsBatterStr && !Number.isNaN(Number(vsBatterStr))
      ? Number(vsBatterStr)
      : null;
  const clearBatterScope = () =>
    setUrl({ vsBatter: null, abGame: null, abNum: null });

  // Mirror the arsenal-shell stripping (drop at-bat-mode params + view)
  // so the unscoped fetches share a browser cache hit with the 3D
  // shell. KEEP `vsBatter` though — the stats view uses it to narrow
  // the sequencing matrix server-side ("his sequencing vs <batter>");
  // when present this becomes a distinct cache key from the shell's
  // unscoped fetch, which is fine (two requests vs one).
  //
  // Also drop `game` and `hand` whenever vsBatter is set: matchup
  // analysis is inherently cross-game ("how does he attack this
  // hitter all season"), and the URL's ?game= filter can be left
  // over from a prior single-game view — without stripping it the
  // user lands on "no pitches to <batter>" when the pitcher didn't
  // face that batter in the filtered game. Hand is implied by the
  // batter so it's also redundant.
  const arsenalQuery = (() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("abGame");
    sp.delete("abNum");
    sp.delete("batterQ");
    sp.delete("view");
    if (sp.get("vsBatter")) {
      sp.delete("game");
      sp.delete("hand");
    }
    sp.set("includeSequence", "1");
    sp.set("includeRadar", "1");
    // Per-game drift series — server skips it under vsBatter, but
    // we always request so the same arsenalQuery serves both views.
    sp.set("includeSequenceVariance", "1");
    return sp.toString();
  })();

  const [pitches, setPitches] = useState<StatPitch[]>([]);
  const [sequenceMatrix, setSequenceMatrix] =
    useState<SequencingMatrixData | null>(null);
  const [sequenceBatterName, setSequenceBatterName] = useState<string | null>(
    null,
  );
  const [arsenalRadar, setArsenalRadar] =
    useState<ArsenalRadarData | null>(null);
  const [sequenceDrift, setSequenceDrift] =
    useState<SequencingDriftData | null>(null);
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
        const body = (await res.json()) as {
          pitches: StatPitch[];
          sequenceMatrix: SequencingMatrixData | null;
          sequenceBatterName: string | null;
          arsenalRadar: ArsenalRadarData | null;
          sequenceDrift: SequencingDriftData | null;
        };
        if (cancelled) return;
        setPitches(body.pitches ?? []);
        setSequenceMatrix(body.sequenceMatrix ?? null);
        setSequenceBatterName(body.sequenceBatterName ?? null);
        setArsenalRadar(body.arsenalRadar ?? null);
        setSequenceDrift(body.sequenceDrift ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setPitches([]);
        setSequenceMatrix(null);
        setSequenceBatterName(null);
        setArsenalRadar(null);
        setSequenceDrift(null);
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
      <div className="space-y-3">
        <StatsScopeBanner
          summary={filterSummary}
          batterScoped={vsBatter != null}
          onClearBatter={clearBatterScope}
        />
        <div className="text-[11px] text-white/55 italic px-1 py-3">
          {vsBatter != null && sequenceBatterName
            ? `No pitches to ${sequenceBatterName} in the current filter.`
            : "No pitches in the current filter."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Scope banner at the very top — mirrors the TopNav title's
          filter-summary string so the cards' scope is unambiguous.
          Includes every active URL filter, not just season +
          vsBatter. */}
      <StatsScopeBanner
        summary={filterSummary}
        batterScoped={vsBatter != null}
        onClearBatter={clearBatterScope}
      />
      {/* Headline spans full width on every breakpoint. */}
      <StatsHeadline total={aggregated.total} />
      {/* The two headline cards — Arsenal (per-pitch stats + league
          radar combined) and Sequencing — span full width because
          they ARE the main view of the pitcher's pitches. */}
      <ArsenalCard
        perPitch={aggregated.perPitch}
        radar={arsenalRadar}
        totalPitches={aggregated.total.pitches}
      />
      <LazyMount minHeight={300}>
        <SequencingMatrix data={sequenceMatrix} batterName={sequenceBatterName} />
      </LazyMount>
      {/* Drift timeline lives directly under the season matrix —
          reads as "here's his season pattern; here's where he
          departed from it". Full width because the chronological
          x-axis benefits from horizontal room. */}
      <LazyMount minHeight={260}>
        <SequencingDrift
          data={sequenceDrift}
          batterScoped={vsBatter != null}
        />
      </LazyMount>
      {/* Supporting analytical cards — 2-col grid only at lg+
          (1024px+). Below that, every card stacks single-column so
          the small-multiples (velocity histograms, heat maps) don't
          get cramped at narrow desktop widths. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
