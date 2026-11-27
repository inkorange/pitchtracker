"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import { openRailTab, usePitcherUrl } from "../rail/usePitcherUrl";
import { atBatKeyHandler, atBat, useAtBatSnapshot } from "./store";
import { atBatResult, countsAfter, pitchResult } from "./labels";
import { formatGameDate, initialLast, lastName, useAtBatInfo, type MatchupAtBat } from "./useAtBatInfo";

/** Swaps the desktop rail to the at-bat panel while ?abGame&abNum are
 *  set. The normal rail stays mounted (hidden) so its tab state — and
 *  the matchup finder — survive the round trip. */
export function RailSwitch({ atBat: atBatPanel, children }: { atBat: ReactNode; children: ReactNode }) {
  const sp = useSearchParams();
  const on = sp.has("abGame") && sp.has("abNum");
  return (
    <>
      {on ? atBatPanel : null}
      <div className={on ? "hidden" : "contents"}>{children}</div>
    </>
  );
}

export function useAtBatNav() {
  const { update, isPending } = usePitcherUrl();
  return {
    isPending,
    goTo: (ab: MatchupAtBat) => update({ abGame: String(ab.game_pk), abNum: String(ab.at_bat_number) }),
    /** Back to the whole arsenal. */
    exit: () => {
      update({ abGame: null, abNum: null, vsBatter: null });
      openRailTab("arsenal");
    },
    /** Back to the list of at-bats vs this batter. */
    allAtBats: () => {
      update({ abGame: null, abNum: null });
      openRailTab("matchups");
    },
  };
}

/** Desktop rail in at-bat mode (design/AtBat.dc.html). */
export function AtBatRail({
  pitcherName,
  pitcherMeta,
  season,
}: {
  pitcherName: string;
  /** "MIL · RHP" */
  pitcherMeta: string;
  season: number;
}) {
  const info = useAtBatInfo(season);
  const { pitches, currentIdx, landed } = useAtBatSnapshot();
  const nav = useAtBatNav();
  const ab = info?.current ?? null;
  const counts = countsAfter(pitches);
  const result = atBatResult(pitches);
  const stand = pitches.find((p) => p.stand)?.stand ?? null;
  const batterTeam = ab ? (ab.inning_topbot === "Top" ? ab.away_abbr : ab.inning_topbot === "Bot" ? ab.home_abbr : null) : null;
  const batterMeta = [batterTeam, stand ? `${stand}HB` : null].filter(Boolean).join(" · ");
  const batterName = info?.batterName ?? "";

  return (
    <div className="flex flex-col min-h-0 grow">
      <TransitionOverlay isPending={nav.isPending} />
      <div className="px-5 py-[18px] flex flex-col gap-3.5 border-b border-line shrink-0">
        <span className="self-start slant-right bg-accent text-white font-display font-bold text-sm tracking-[1.5px] uppercase pl-2.5 pr-3.5 py-0.5">
          At-bat replay
        </span>
        <p
          role="heading"
          aria-level={1}
          aria-label={`${pitcherName} versus ${batterName || "batter"}`}
          className="m-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5"
        >
          <span className="flex flex-col gap-1 min-w-0" aria-hidden="true">
            <span className="label-caps truncate">{pitcherMeta}</span>
            <span className="font-display font-extrabold text-2xl leading-none uppercase truncate">{initialLast(pitcherName)}</span>
          </span>
          <span aria-hidden="true" className="font-display font-bold text-base text-muted">
            VS
          </span>
          <span className="flex flex-col gap-1 min-w-0 text-right" aria-hidden="true">
            <span className="label-caps truncate">{batterMeta || " "}</span>
            <span className="font-display font-extrabold text-2xl leading-none uppercase truncate">
              {batterName ? initialLast(batterName) : "…"}
            </span>
          </span>
        </p>
        <div className="flex justify-between gap-3 text-[13px] text-muted num">
          <span className="truncate">
            {ab ? `${formatGameDate(ab.game_date)} · ${ab.away_abbr ?? "?"} @ ${ab.home_abbr ?? "?"}` : " "}
          </span>
          {ab ? <span className="shrink-0">AB #{ab.at_bat_number}</span> : null}
        </div>
      </div>

      <div className="px-5 pt-3.5 pb-1.5 flex justify-between label-caps">
        <span>Pitch sequence</span>
        <span>Mph · count</span>
      </div>
      <ol className="list-none m-0 px-3 pb-2 grow overflow-y-auto" aria-label="Pitch sequence" onKeyDown={atBatKeyHandler}>
        {pitches.length === 0 ? <li className="px-2 py-3 text-sm text-muted">Loading pitches…</li> : null}
        {pitches.map((p, i) => {
          const cur = i === currentIdx;
          const c = p.pitch_type ? getPitchColor(p.pitch_type) : "var(--muted)";
          // Results reveal as playback reaches them.
          const revealed = i < currentIdx || (cur && landed);
          return (
            <li key={p.pitch_number} className="mb-1">
              <button
                type="button"
                aria-current={cur ? "step" : undefined}
                onClick={() => atBat.jumpTo(i, false)}
                className={`w-full flex items-center gap-3 min-h-14 px-2.5 py-1.5 rounded-panel border text-left text-ink transition-opacity ${
                  cur ? "bg-surface-2" : "border-transparent hover:bg-surface"
                } ${i > currentIdx ? "opacity-45" : ""}`}
                style={cur ? { borderColor: c } : undefined}
              >
                <span
                  aria-hidden="true"
                  className="size-[26px] shrink-0 rounded-full flex items-center justify-center font-display font-bold text-[15px] text-bg"
                  style={{ background: c }}
                >
                  {i + 1}
                </span>
                <span className="grow min-w-0 flex flex-col">
                  <span className="text-sm font-semibold truncate">
                    <span className="sr-only">Pitch {i + 1}: </span>
                    {p.pitch_type ? getPitchLabel(p.pitch_type) : "Pitch"}
                  </span>
                  <span className="text-xs text-muted truncate">{revealed ? pitchResult(p.description) : " "}</span>
                </span>
                <span className="font-display font-bold text-xl num">{p.release_speed?.toFixed(1) ?? "—"}</span>
                <span className="w-10 text-right font-display font-bold text-lg text-ink-2 num">{revealed ? counts[i] : ""}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="px-5 py-3.5 border-t border-line flex flex-col gap-2.5 shrink-0">
        {result && currentIdx === pitches.length - 1 && landed ? (
          <p className="m-0 font-display font-bold text-xl uppercase leading-tight">Result · {result}</p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!info?.prev}
            onClick={() => info?.prev && nav.goTo(info.prev)}
            className="flex-1 h-10 rounded-control border border-line-strong text-[13px] font-semibold text-ink hover:border-ink-2 disabled:opacity-40 disabled:hover:border-line-strong"
          >
            ← Prev at-bat
          </button>
          <button
            type="button"
            disabled={!info?.next}
            onClick={() => info?.next && nav.goTo(info.next)}
            className="flex-1 h-10 rounded-control border border-line-strong text-[13px] font-semibold text-ink hover:border-ink-2 disabled:opacity-40 disabled:hover:border-line-strong"
          >
            Next at-bat →
          </button>
        </div>
        <button
          type="button"
          onClick={nav.allAtBats}
          className="h-10 rounded-control bg-surface-2 text-[13px] font-semibold text-ink hover:bg-surface-2/70 truncate px-3"
        >
          All at-bats vs {batterName ? lastName(batterName) : "this batter"}
          {info ? ` (${info.all.length})` : ""}
        </button>
      </div>
    </div>
  );
}
