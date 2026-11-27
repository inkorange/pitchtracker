"use client";

import { useColorBy } from "./colorBy";
import { LowerThird } from "@/components/broadcast";
import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";
import { AT_BAT_EVENT_CHIPS } from "@/lib/at-bat-events";
import {
  getPitchColor,
  getPitchLabel,
  OUTCOME_COLORS,
  OUTCOME_LABELS,
  type OutcomeCategory,
} from "@/lib/viz/colors";
import { usePitcherView } from "../StatsModeToggle";
import { openRailTab, usePitcherUrl } from "./usePitcherUrl";


const LEGEND_OUTCOMES: OutcomeCategory[] = ["whiff", "called", "ball", "foul", "inplay"];


/**
 * Desktop scene overlays (design/Pitcher.dc.html): view toggle +
 * removable active-filter chips (top-left), legend with Color by
 * (top-right), lower third (bottom-left). Sits over the scene area,
 * right of the rail and under the top bar.
 */
export function SceneChrome({
  pitchTypes,
  gameLabels,
  batterName,
  lowerLabel,
  lowerValue,
}: {
  /** Pitch types in the current arsenal, most-used first (legend). */
  pitchTypes: string[];
  gameLabels: Record<string, string>;
  batterName: string | null;
  lowerLabel: string;
  lowerValue: string;
}) {
  const { params, update, isPending } = usePitcherUrl();
  const [view, setView] = usePitcherView();
  const [colorBy, setColorBy] = useColorBy();
  const inAtBat = params.has("abGame") && params.has("abNum");

  const chips = useFilterChips(gameLabels, batterName);

  // At-bat mode has its own overlays (atbat/AtBatOverlays) and exits
  // from the top bar.
  if (inAtBat) return null;

  return (
    <div className="hidden lg:block absolute top-14 left-[384px] right-0 bottom-0 pointer-events-none z-20">
      <TransitionOverlay isPending={isPending} />
      <div className="absolute top-4 left-4 right-4 flex items-start gap-3">
        <div className="flex flex-wrap items-center gap-2 grow pointer-events-auto">
          <div role="group" aria-label="View" className="flex bg-overlay border border-line-strong rounded-control p-[3px]">
            {(
              [
                ["arsenal", "3D scene"],
                ["stats", "Stats"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={view === k}
                onClick={() => setView(k)}
                className={`h-[30px] px-3 rounded-[2px] text-[13px] ${
                  view === k ? "bg-ink text-bg font-bold" : "text-ink-2 font-semibold hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {!inAtBat && view === "arsenal"
            ? chips.map((c) => (
                <span
                  key={`${c.k}-${c.v}`}
                  className="h-9 pl-3 flex items-center rounded-full bg-overlay border border-line-strong text-[13px] font-semibold text-ink"
                >
                  <span className="text-muted font-medium mr-1">{c.k}</span>
                  {c.v}
                  <button
                    type="button"
                    aria-label={`Remove filter: ${c.k} ${c.v}`}
                    onClick={() => update(c.clear)}
                    className="size-8 flex items-center justify-center text-ink-2 hover:text-ink text-base"
                  >
                    ×
                  </button>
                </span>
              ))
            : null}
          {!inAtBat && view === "arsenal" ? (
            <button
              type="button"
              onClick={() => openRailTab("filters")}
              className="h-9 px-3 rounded-full border border-dashed border-line-strong bg-overlay text-[13px] font-semibold text-ink-2 hover:text-ink"
            >
              + Add filter
            </button>
          ) : null}
        </div>

        {view === "arsenal" && !inAtBat ? (
          <div className="pointer-events-auto flex flex-col gap-2 p-2.5 rounded-control bg-overlay border border-line-strong min-w-[180px]">
            <div role="group" aria-label="Color pitches by" className="flex bg-surface rounded-[3px] p-0.5">
              {(
                [
                  ["type", "Pitch type"],
                  ["outcome", "Outcome"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={colorBy === k}
                  onClick={() => setColorBy(k === "type" ? null : k)}
                  className={`flex-1 h-7 px-2 rounded-[2px] text-xs ${
                    colorBy === k ? "bg-ink text-bg font-bold" : "text-ink-2 font-semibold hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <ul className="list-none m-0 p-0 flex flex-col gap-1.5 px-1">
              {(colorBy === "outcome"
                ? LEGEND_OUTCOMES.map((o) => ({ key: o, color: OUTCOME_COLORS[o], label: OUTCOME_LABELS[o] }))
                : pitchTypes.map((t) => ({ key: t, color: getPitchColor(t), label: getPitchLabel(t) }))
              ).map((l) => (
                <li key={l.key} className="flex items-center gap-2 text-[13px] text-ink">
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {view === "arsenal" && !inAtBat ? (
        <LowerThird className="absolute left-4 bottom-4" size="sm" label={lowerLabel} value={lowerValue} />
      ) : null}
    </div>
  );
}

export interface FilterChip {
  k: string;
  v: string;
  clear: Record<string, string | null>;
}

/** Removable chips for every active URL filter (desktop + mobile scene). */
export function useFilterChips(gameLabels: Record<string, string>, batterName: string | null): FilterChip[] {
  const { params, list } = usePitcherUrl();
  const chips: FilterChip[] = [];
  const pitches = list("pitch");
  for (const t of pitches) {
    chips.push({ k: "Pitch", v: getPitchLabel(t), clear: { pitch: pitches.filter((x) => x !== t).join(",") || null } });
  }
  const hand = params.get("hand");
  if (hand) chips.push({ k: "Batter", v: `vs ${hand}HB`, clear: { hand: null } });
  const outcomes = list("outcome");
  for (const o of outcomes) {
    chips.push({
      k: "Outcome",
      v: OUTCOME_LABELS[o as OutcomeCategory] ?? o,
      clear: { outcome: outcomes.filter((x) => x !== o).join(",") || null },
    });
  }
  for (const e of list("event")) {
    chips.push({ k: "Result", v: AT_BAT_EVENT_CHIPS.find((c) => c.key === e)?.label ?? e.replace(/_/g, " "), clear: { event: null } });
  }
  const game = params.get("game");
  if (game) chips.push({ k: "Game", v: gameLabels[game] ?? `#${game}`, clear: { game: null } });
  const vMin = params.get("veloMin");
  const vMax = params.get("veloMax");
  if (vMin || vMax) chips.push({ k: "Velo", v: `${vMin ?? "…"}–${vMax ?? "…"} mph`, clear: { veloMin: null, veloMax: null } });
  const st = params.get("seasonType");
  if (!game && (st === "post" || st === "all"))
    chips.push({ k: "Season", v: st === "post" ? "Postseason" : "Regular + postseason", clear: { seasonType: null } });
  if (params.get("vsBatter")) chips.push({ k: "Vs", v: batterName ?? "batter", clear: { vsBatter: null } });

  return chips;
}
