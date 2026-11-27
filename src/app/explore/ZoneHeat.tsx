"use client";

import { useMemo } from "react";
import { CHASE_ZONES, IN_ZONE, zoneFor } from "@/lib/explore/query";
import type { SavantPitchRow } from "@/lib/savant/client";

// "Zone heat" result view: share of the matched pitches in each strike
// zone (1–9) and chase quadrant (11–14), catcher's view.
export function ZoneHeat({ rows }: { rows: SavantPitchRow[] }) {
  const { counts, total } = useMemo(() => {
    const m = new Map<number, number>();
    let n = 0;
    for (const r of rows) {
      const z = zoneFor(r.plate_x, r.plate_z);
      if (z == null) continue;
      m.set(z, (m.get(z) ?? 0) + 1);
      n++;
    }
    return { counts: m, total: n };
  }, [rows]);
  const max = Math.max(1, ...counts.values());

  const cell = (z: number, extra: string) => {
    const c = counts.get(z) ?? 0;
    const pct = total ? (c / total) * 100 : 0;
    const a = c / max;
    return (
      <div
        key={z}
        className={`flex flex-col ${extra}`}
        style={{ background: `rgba(232, 54, 79, ${0.08 + a * 0.72})` }}
        title={`Zone ${z}: ${c.toLocaleString()} pitches`}
      >
        <span className="font-display font-bold text-xl leading-none num">{pct.toFixed(1)}%</span>
        <span className="text-[11px] text-ink-2 num">{c.toLocaleString()}</span>
      </div>
    );
  };

  return (
    <figure className="m-0 flex flex-col md:flex-row gap-6 items-center p-5 bg-surface border border-line rounded-panel">
      <div
        role="img"
        aria-label={`Zone heat map of ${total.toLocaleString()} pitches: ${[...IN_ZONE, ...CHASE_ZONES]
          .map((z) => `zone ${z} ${(((counts.get(z) ?? 0) / Math.max(total, 1)) * 100).toFixed(1)}%`)
          .join(", ")}`}
        className="relative w-[300px] h-[360px] shrink-0 rounded-control overflow-hidden border border-line-strong"
      >
        <div aria-hidden="true" className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-line">
          {cell(11, "items-start justify-start p-2.5")}
          {cell(12, "items-end justify-start p-2.5 text-right")}
          {cell(13, "items-start justify-end p-2.5")}
          {cell(14, "items-end justify-end p-2.5 text-right")}
        </div>
        <div
          aria-hidden="true"
          className="absolute left-[60px] top-[68px] w-[180px] h-[224px] grid grid-cols-3 grid-rows-3 gap-px bg-line border-2 border-ink"
        >
          {IN_ZONE.map((z) => cell(z, "items-center justify-center text-center"))}
        </div>
      </div>
      <figcaption className="text-sm text-ink-2 leading-relaxed max-w-sm">
        Share of the {total.toLocaleString()} matched pitches crossing each zone, from the catcher’s view.
        Zones 1–9 are the strike zone; the corners (11–14) are chase zones. Darker = more pitches.
      </figcaption>
    </figure>
  );
}
