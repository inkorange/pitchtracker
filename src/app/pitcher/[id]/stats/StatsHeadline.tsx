"use client";

import type { TotalStats } from "./aggregations";

// Three-tile summary at the top of the Stats view: total pitches,
// overall CSW%, overall Whiff%. CSW% (Called + Swinging strike rate)
// is the de-facto headline analytic for pitching arsenal quality —
// every scouting writeup leads with it.
export function StatsHeadline({ total }: { total: TotalStats }) {
  const items: Array<{ label: string; value: string; hint?: string }> = [
    { label: "Pitches", value: total.pitches.toLocaleString() },
    { label: "CSW%", value: fmtPct(total.csw_pct), hint: "Called + Swinging" },
    { label: "Whiff%", value: fmtPct(total.whiff_pct), hint: "Swing & miss" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg bg-white/[0.04] border border-white/10 p-3"
        >
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
            {it.label}
          </div>
          <div className="text-xl tabular-nums text-white mt-0.5 font-semibold">
            {it.value}
          </div>
          {it.hint ? (
            <div className="text-[10px] text-white/40 mt-0.5">{it.hint}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}
