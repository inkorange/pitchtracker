"use client";

import type { ReactNode } from "react";
import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";
import { parseSeasonType } from "@/lib/pitcher/season-type";
import { usePitcherUrl } from "./usePitcherUrl";

const ALL_LABEL = { reg: "All regular-season games", post: "All postseason games", all: "All games" } as const;

export interface RailGame {
  game_pk: number;
  game_date: string;
  away: string;
  home: string;
  /** Postseason game (tagged in the list). */
  post?: boolean;
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
  const hasPost = games.some((g) => g.post);
  const allLabel = hasPost ? `${ALL_LABEL[parseSeasonType(params.get("seasonType"))]} · ${season}` : `All games in ${season}`;
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
        <span className="text-sm font-semibold">{allLabel}</span>
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
            <span className="flex items-center gap-2">
              <span className="font-display font-bold text-lg tracking-[0.5px]">
                {g.away} @ {g.home}
              </span>
              {g.post ? (
                <span className="px-1.5 py-0.5 rounded-[2px] bg-highlight/15 text-highlight text-[10px] font-bold tracking-[1px] uppercase">
                  Postseason
                </span>
              ) : null}
            </span>
            <span className="text-[13px] text-muted num">{short(g.game_date)}</span>
          </button>
        );
      })}
    </div>
  );
}
