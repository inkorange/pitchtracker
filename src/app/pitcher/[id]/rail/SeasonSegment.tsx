"use client";

import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";
import { usePitcherUrl } from "./usePitcherUrl";

/** Season switch for the rail header: the three most recent seasons as
 *  a segmented control, older ones in a "More" select. */
export function SeasonSegment({ season, available }: { season: number; available: number[] }) {
  const { update, isPending } = usePitcherUrl();
  // game ids are season-scoped, so a season change drops ?game.
  const go = (s: number) => update({ season: String(s), game: null });
  const recent = available.slice(0, 3);
  const older = available.slice(3);
  return (
    <div className="flex items-center gap-2">
      <TransitionOverlay isPending={isPending} />
      <div role="group" aria-label="Season" className="flex bg-surface border border-line rounded-control p-[3px]">
        {recent.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === season}
            onClick={() => s !== season && go(s)}
            className={`h-[30px] px-3.5 rounded-[2px] text-[13px] num ${
              s === season ? "bg-ink text-bg font-bold" : "text-ink-2 font-semibold hover:text-ink"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {older.length ? (
        <label>
          <span className="sr-only">Older season</span>
          <select
            value={older.includes(season) ? season : ""}
            onChange={(e) => e.target.value && go(Number(e.target.value))}
            className="select-chevron h-9 pl-2.5 rounded-control border border-line-strong bg-surface text-ink-2 text-[13px] num"
          >
            <option value="">More</option>
            {older.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
