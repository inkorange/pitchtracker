"use client";

import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import type { PerPitchStats } from "./aggregations";

// The arsenal table — one row per pitch type, columns mirror the
// Savant scouting card: usage % first (sorted desc), then velo, then
// CSW%, then Whiff%. Colored dot + label match the 3D scene's pitch
// palette so the row reads as the same pitch the user sees in
// Arsenal mode.
export function PerPitchTable({ rows }: { rows: PerPitchStats[] }) {
  if (rows.length === 0) {
    return (
      <Card title="Arsenal">
        <div className="text-[11px] text-white/55 italic">
          No pitches in the current filter.
        </div>
      </Card>
    );
  }
  return (
    <Card title="Arsenal">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 gap-y-1.5 items-center text-[11px] tabular-nums">
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
          Pitch
        </div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 text-right">
          Use%
        </div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 text-right">
          Velo
        </div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 text-right">
          CSW%
        </div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 text-right">
          Whiff%
        </div>
        {rows.map((r) => (
          <Row key={r.pitch_type} r={r} />
        ))}
      </div>
    </Card>
  );
}

function Row({ r }: { r: PerPitchStats }) {
  const color = getPitchColor(r.pitch_type);
  const label = getPitchLabel(r.pitch_type);
  return (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: color }}
          aria-hidden
        />
        <span className="truncate text-white/95">{label}</span>
      </div>
      <div className="text-right text-white/85">
        {r.usage_pct.toFixed(0)}%
        <span className="text-white/40 text-[10px] ml-1">
          ({r.pitches})
        </span>
      </div>
      <div className="text-right text-white/85">
        {r.velo_mean != null ? `${r.velo_mean.toFixed(1)}` : "—"}
      </div>
      <div className="text-right text-white/85">
        {r.csw_pct.toFixed(1)}%
      </div>
      <div className="text-right text-white/85">
        {r.whiff_pct.toFixed(1)}%
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/10 p-4 space-y-3">
      <h3 className="text-[10px] uppercase tracking-[0.16em] text-white/55">
        {title}
      </h3>
      {children}
    </section>
  );
}
