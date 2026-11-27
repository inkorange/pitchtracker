"use client";

import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import { usePitcherUrl } from "./usePitcherUrl";

export interface ArsenalRow {
  pitch_type: string;
  pitch_count: number;
  usage_pct: number;
  avg_velocity: number | null;
}

/**
 * Arsenal list — each row is a toggle button (aria-pressed) and the
 * list *is* the pitch-type filter (?pitch=). With nothing selected,
 * every type shows; selecting rows narrows the scene to them.
 */
export function ArsenalToggles({ rows, season }: { rows: ArsenalRow[]; season: number }) {
  const { update, list, isPending } = usePitcherUrl();
  const selected = list("pitch");

  if (rows.length === 0) {
    return <p className="m-0 text-sm text-muted">No pitches for {season} with these filters.</p>;
  }

  const toggle = (t: string) => {
    const next = selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t];
    update({ pitch: next.length ? next.join(",") : null });
  };

  return (
    <div className="flex flex-col">
      <TransitionOverlay isPending={isPending} />
      <div className="flex justify-between px-1 pb-2 label-caps">
        <span>Pitch · tap to show/hide</span>
        <span>Mph · usage</span>
      </div>
      <ul className="list-none m-0 p-0 flex flex-col gap-1">
        {rows.map((r) => {
          const shown = selected.length === 0 || selected.includes(r.pitch_type);
          const pressed = selected.includes(r.pitch_type);
          const color = getPitchColor(r.pitch_type);
          return (
            <li key={r.pitch_type}>
              <button
                type="button"
                aria-pressed={pressed}
                onClick={() => toggle(r.pitch_type)}
                className={`w-full flex items-center gap-3 min-h-14 px-2.5 py-2 rounded-control text-left transition-colors ${
                  pressed ? "bg-surface-2" : "hover:bg-surface"
                } ${shown ? "" : "opacity-45"}`}
              >
                <span
                  aria-hidden="true"
                  className="size-[18px] shrink-0 rounded-[3px] border-2 flex items-center justify-center"
                  style={{ borderColor: color, background: shown ? color : "transparent" }}
                >
                  {shown ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="4">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  ) : null}
                </span>
                <span className="grow min-w-0 flex flex-col gap-[5px]">
                  <span className="text-sm font-semibold text-ink truncate">{getPitchLabel(r.pitch_type)}</span>
                  <span className="h-1 bg-line rounded-sm overflow-hidden block">
                    <span className="block h-1" style={{ width: `${Math.max(r.usage_pct, 1)}%`, background: color }} />
                  </span>
                </span>
                <span className="w-[48px] shrink-0 text-right font-display font-bold text-xl text-ink num">
                  {r.avg_velocity != null ? r.avg_velocity.toFixed(1) : "—"}
                </span>
                <span className="w-[78px] shrink-0 text-right text-xs text-muted num whitespace-nowrap">
                  {Math.round(r.usage_pct)}% · {r.pitch_count.toLocaleString()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
