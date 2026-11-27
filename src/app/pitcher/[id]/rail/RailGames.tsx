"use client";

import type { ReactNode } from "react";
import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";
import { usePitcherUrl } from "./usePitcherUrl";

export interface RailGame {
  game_pk: number;
  game_date: string;
  away: string;
  home: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : iso;
};

/** Games tab — pick a start (?game=). The selected game's line shows on top. */
export function RailGames({
  games,
  season,
  totalPitches,
  gameLine,
}: {
  games: RailGame[];
  season: number;
  totalPitches: number;
  gameLine: ReactNode;
}) {
  const { params, update, isPending } = usePitcherUrl();
  const active = params.get("game") ?? "";
  const row = (on: boolean) =>
    `w-full flex items-center justify-between gap-3 min-h-12 px-3 rounded-control text-left transition-colors ${
      on ? "bg-surface-2 text-ink" : "text-ink hover:bg-surface"
    }`;

  return (
    <div className="flex flex-col gap-1">
      <TransitionOverlay isPending={isPending} />
      {gameLine ? <div className="mb-3">{gameLine}</div> : null}
      <div className="px-1 pb-2 label-caps">
        {games.length} games · tap to filter
      </div>
      <button type="button" aria-pressed={active === ""} onClick={() => update({ game: null })} className={row(active === "")}>
        <span className="text-sm font-semibold">All games in {season}</span>
        <span className="text-xs text-muted num">{totalPitches.toLocaleString()}</span>
      </button>
      {games.map((g) => {
        const on = active === String(g.game_pk);
        return (
          <button
            key={g.game_pk}
            type="button"
            aria-pressed={on}
            onClick={() => update({ game: on ? null : String(g.game_pk) })}
            className={row(on)}
          >
            <span className="font-display font-bold text-lg tracking-[0.5px]">
              {g.away} @ {g.home}
            </span>
            <span className="text-[13px] text-muted num">{short(g.game_date)}</span>
          </button>
        );
      })}
    </div>
  );
}
