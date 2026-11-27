"use client";

import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";
import { parseSeasonType, type SeasonType } from "@/lib/pitcher/season-type";
import { usePitcherUrl } from "./usePitcherUrl";

const OPTIONS: [SeasonType, string][] = [
  ["reg", "Regular season"],
  ["post", "Postseason"],
  ["all", "All"],
];

/** Regular season / Postseason / All (?seasonType) for the whole pitcher
 *  page. Render it only for seasons that have postseason games. Picking
 *  one leaves a selected game, since a game is already one type. */
export function SeasonTypeToggle({ className = "" }: { className?: string }) {
  const { params, update, isPending } = usePitcherUrl();
  const current = parseSeasonType(params.get("seasonType"));
  return (
    <div role="group" aria-label="Season type" className={`flex bg-surface border border-line rounded-control p-[3px] ${className}`}>
      <TransitionOverlay isPending={isPending} />
      {OPTIONS.map(([k, label]) => (
        <button
          key={k}
          type="button"
          aria-pressed={current === k}
          onClick={() => current !== k && update({ seasonType: k === "reg" ? null : k, game: null })}
          className={`grow h-[30px] px-3 rounded-[2px] text-[13px] whitespace-nowrap ${
            current === k ? "bg-ink text-bg font-bold" : "text-ink-2 font-semibold hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
