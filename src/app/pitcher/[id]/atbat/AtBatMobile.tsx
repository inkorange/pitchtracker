"use client";

import { useEffect, useRef, useState } from "react";
import { LowerThird } from "@/components/broadcast";
import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import { useAtBatNav } from "./AtBatRail";
import { countBefore, countsAfter, pitchResult, pitchResultShort, shortPitchName } from "./labels";
import { atBat, atBatKeyHandler, useAtBatSnapshot } from "./store";
import { formatGameDate, lastName, shareAtBat, useAtBatInfo } from "./useAtBatInfo";

/** Mobile header in at-bat mode (design/AtBatMobile.dc.html): exit,
 *  "PITCHER vs BATTER" (each name truncates on its own), game line,
 *  share. */
export function AtBatMobileHeader({ pitcherName, season }: { pitcherName: string; season: number }) {
  const info = useAtBatInfo(season);
  const nav = useAtBatNav();
  const [shared, setShared] = useState<string | null>(null);
  const ab = info?.current ?? null;
  const batter = info?.batterName ?? "";
  return (
    <header className="absolute inset-x-0 top-0 h-14 z-30 flex items-center gap-1 px-1 bg-bg-raised border-b border-line">
      <TransitionOverlay isPending={nav.isPending} />
      <button type="button" aria-label="Exit at-bat" onClick={nav.exit} className="size-11 shrink-0 flex items-center justify-center text-ink">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div className="grow min-w-0 flex flex-col">
        <p
          role="heading"
          aria-level={1}
          aria-label={`${pitcherName} versus ${batter || "batter"}`}
          className="m-0 flex items-baseline gap-1.5 min-w-0 font-display font-extrabold text-xl leading-[1.1] uppercase"
        >
          <span aria-hidden="true" className="min-w-0 truncate">{lastName(pitcherName)}</span>
          <span aria-hidden="true" className="shrink-0 text-muted font-bold normal-case">vs</span>
          <span aria-hidden="true" className="min-w-0 truncate">{batter ? lastName(batter) : "…"}</span>
        </p>
        <span className="text-xs text-muted truncate num">
          {ab ? `${formatGameDate(ab.game_date, false)} · ${ab.away_abbr ?? "?"} @ ${ab.home_abbr ?? "?"} · AB #${ab.at_bat_number}` : " "}
        </span>
      </div>
      <button
        type="button"
        aria-label="Share at-bat"
        onClick={async () => {
          const r = await shareAtBat(`${pitcherName} vs ${batter}`);
          if (r === "copied") {
            setShared("Link copied");
            setTimeout(() => setShared(null), 2000);
          }
        }}
        className="size-11 shrink-0 flex items-center justify-center text-ink"
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" />
        </svg>
      </button>
      <span role="status" className={shared ? "absolute right-2 top-full mt-1 px-2.5 py-1 rounded-control bg-ink text-bg text-xs font-semibold" : "sr-only"}>
        {shared ?? ""}
      </span>
    </header>
  );
}

/** Mobile panel under the scene: current-pitch lower third, scrolling
 *  pitch cards (100px, so the 4th peeks as a scroll hint) and the
 *  transport row. Replaces the drawer while an at-bat plays. */
export function AtBatMobilePanel() {
  const { pitches, currentIdx, landed, playing, done } = useAtBatSnapshot();
  const counts = countsAfter(pitches);
  const cur = pitches[currentIdx];
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-current="step"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [currentIdx]);

  return (
    <section
      aria-label="Pitch sequence"
      onKeyDown={atBatKeyHandler}
      className="fixed inset-x-0 bottom-0 h-[248px] z-[45] flex flex-col bg-bg-raised border-t border-line-strong"
    >
      {cur ? (
        <LowerThird
          className="mx-4 mt-3 py-2"
          size="sm"
          color={cur.pitch_type ? getPitchColor(cur.pitch_type) : undefined}
          label={`Pitch ${currentIdx + 1} · ${countBefore(cur)} count`}
          value={`${cur.pitch_type ? getPitchLabel(cur.pitch_type) : "Pitch"}${landed ? ` · ${pitchResult(cur.description)}` : ""}`}
        />
      ) : (
        <p className="mx-4 mt-3 text-sm text-muted">Loading pitches…</p>
      )}
      <ol ref={listRef} className="list-none m-0 flex gap-2 pl-4 pr-4 py-2.5 overflow-x-auto scrollbar-thin">
        {pitches.map((p, i) => {
          const isCur = i === currentIdx;
          const revealed = i < currentIdx || (isCur && landed);
          const c = p.pitch_type ? getPitchColor(p.pitch_type) : "var(--muted)";
          return (
            <li key={p.pitch_number} className="shrink-0">
              <button
                type="button"
                aria-current={isCur ? "step" : undefined}
                aria-label={`Pitch ${i + 1}: ${p.pitch_type ? getPitchLabel(p.pitch_type) : "pitch"}, ${p.release_speed?.toFixed(1) ?? "—"} mph${revealed ? `, ${pitchResult(p.description)}` : ""}`}
                onClick={() => atBat.jumpTo(i, false)}
                className={`w-[100px] flex flex-col items-start gap-1 px-2.5 py-2 rounded-control border text-left ${
                  isCur ? "bg-surface-2" : "bg-surface border-line"
                } ${i > currentIdx ? "opacity-45" : ""}`}
                style={isCur ? { borderColor: c } : undefined}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-5 rounded-full flex items-center justify-center font-display font-bold text-[13px] text-bg"
                    style={{ background: c }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-xs font-semibold whitespace-nowrap">{shortPitchName(p.pitch_type)}</span>
                </span>
                <span className="font-display font-bold text-xl leading-none num">{p.release_speed?.toFixed(1) ?? "—"}</span>
                <span className="text-[11px] text-muted whitespace-nowrap num">
                  {revealed ? `${pitchResultShort(p.description)} · ${counts[i]}` : " "}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-auto pb-3 flex items-center justify-center gap-5">
        <button
          type="button"
          aria-label="Previous pitch"
          disabled={currentIdx <= 0}
          onClick={() => atBat.step(-1)}
          className="size-12 rounded-full border border-line-strong text-ink flex items-center justify-center disabled:opacity-35"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 5h2v14H6zM20 5v14L9 12z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={done ? "Replay at-bat" : playing ? "Pause" : "Play at-bat"}
          onClick={atBat.togglePlay}
          className="size-14 rounded-full bg-accent text-white flex items-center justify-center"
        >
          {playing ? (
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
            </svg>
          ) : (
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 4l13 8-13 8z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          aria-label="Next pitch"
          disabled={currentIdx >= pitches.length - 1}
          onClick={() => atBat.step(1)}
          className="size-12 rounded-full border border-line-strong text-ink flex items-center justify-center disabled:opacity-35"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
          </svg>
        </button>
      </div>
    </section>
  );
}
