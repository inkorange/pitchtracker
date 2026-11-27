"use client";

import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import type { ArsenalRow } from "./ArsenalToggles";
import { usePitcherUrl } from "./usePitcherUrl";

/** Drawer-peek arsenal: horizontally scrolling toggle cards (design/MobileSheetPeek). */
export function ArsenalCards({ rows }: { rows: ArsenalRow[] }) {
  const { update, list, isPending } = usePitcherUrl();
  const selected = list("pitch");
  const toggle = (t: string) => {
    const next = selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t];
    update({ pitch: next.length ? next.join(",") : null });
  };
  return (
    <ul className="list-none m-0 flex gap-2 px-5 pt-3.5 pb-3 overflow-x-auto scrollbar-thin" aria-label="Arsenal">
      <TransitionOverlay isPending={isPending} />
      {rows.map((r) => {
        const pressed = selected.includes(r.pitch_type);
        const shown = selected.length === 0 || pressed;
        const color = getPitchColor(r.pitch_type);
        return (
          <li key={r.pitch_type} className="shrink-0">
            <button
              type="button"
              aria-pressed={pressed}
              onClick={() => toggle(r.pitch_type)}
              className={`w-[118px] h-[76px] flex flex-col justify-between px-3 py-2.5 rounded-control border-[1.5px] text-left transition-opacity ${
                pressed ? "bg-surface-2" : "bg-surface border-line"
              } ${shown ? "" : "opacity-45"}`}
              style={pressed ? { borderColor: color } : undefined}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink truncate">
                <span aria-hidden="true" className="size-[9px] rounded-full shrink-0" style={{ background: color }} />
                {getPitchLabel(r.pitch_type)}
              </span>
              <span className="font-display font-bold text-[22px] leading-none num">
                {r.avg_velocity != null ? r.avg_velocity.toFixed(1) : "—"}
                <span className="text-[13px] text-muted ml-1">{Math.round(r.usage_pct)}%</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
