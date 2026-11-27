"use client";

import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";
import { AT_BAT_EVENT_CHIPS, compatibleOutcomesForAtBatEvents } from "@/lib/at-bat-events";
import { OUTCOME_COLORS, OUTCOME_LABELS, type OutcomeCategory } from "@/lib/viz/colors";
import { usePitcherUrl } from "./usePitcherUrl";

const OUTCOMES: OutcomeCategory[] = ["whiff", "called", "ball", "foul", "inplay"];

const CHIP = "h-11 md:h-9 px-3 rounded-full border text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors";
const ON = "bg-ink text-bg border-ink";
const OFF = "text-ink-2 border-line-strong hover:text-ink hover:border-ink-2";

/** Filters tab — batter side, pitch outcome, at-bat result. Same URL
 *  keys and rules as the previous PitcherFilters. */
export function RailFilters({ showReset = true }: { showReset?: boolean }) {
  const { params, update, list, isPending } = usePitcherUrl();
  const hand = params.get("hand") ?? "";
  const outcomes = list("outcome");
  const events = list("event");
  const compatible = compatibleOutcomesForAtBatEvents(events);

  const toggleOutcome = (c: OutcomeCategory) => {
    if (compatible && !compatible.has(c)) return;
    const next = outcomes.includes(c) ? outcomes.filter((x) => x !== c) : [...outcomes, c];
    update({ outcome: next.length ? next.join(",") : null });
  };
  const toggleEvent = (key: string) => {
    const next = events.length === 1 && events[0] === key ? null : key;
    const patch: Record<string, string | null> = { event: next };
    if (next) {
      const ok = compatibleOutcomesForAtBatEvents([next]);
      if (ok && outcomes.length) {
        const kept = outcomes.filter((o) => ok.has(o as OutcomeCategory));
        patch.outcome = kept.length ? kept.join(",") : null;
      }
    }
    update(patch);
  };
  const any = hand || outcomes.length || events.length || params.get("veloMin") || params.get("veloMax");

  return (
    <div className="flex flex-col gap-[22px]">
      <TransitionOverlay isPending={isPending} />
      <fieldset className="border-0 p-0 m-0 flex flex-col gap-2.5">
        <legend className="label-caps mb-2.5">Batter side</legend>
        <div className="flex bg-surface border border-line rounded-control p-[3px]">
          {(
            [
              ["", "Both"],
              ["L", "vs LHB"],
              ["R", "vs RHB"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={hand === k}
              onClick={() => update({ hand: k || null })}
              className={`flex-1 h-11 md:h-[34px] rounded-[2px] text-[13px] ${
                hand === k ? "bg-ink text-bg font-bold" : "text-ink-2 font-semibold hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-0 p-0 m-0">
        <legend className="label-caps mb-2.5">Pitch outcome</legend>
        <div className="flex flex-wrap gap-2">
          {OUTCOMES.map((o) => {
            const disabled = compatible != null && !compatible.has(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={outcomes.includes(o)}
                disabled={disabled}
                onClick={() => toggleOutcome(o)}
                className={`${CHIP} ${outcomes.includes(o) ? ON : OFF} disabled:opacity-35 disabled:cursor-not-allowed`}
              >
                <span aria-hidden="true" className="size-[9px] rounded-full" style={{ background: OUTCOME_COLORS[o] }} />
                {OUTCOME_LABELS[o]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="border-0 p-0 m-0">
        <legend className="label-caps mb-2.5">At-bat result</legend>
        <div className="flex flex-wrap gap-2">
          {AT_BAT_EVENT_CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={events.includes(c.key)}
              onClick={() => toggleEvent(c.key)}
              className={`${CHIP} ${events.includes(c.key) ? ON : OFF}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>

      {showReset && any ? (
        <button
          type="button"
          onClick={() => update({ hand: null, outcome: null, event: null, veloMin: null, veloMax: null, pitch: null })}
          className="self-start h-9 px-1 text-[13px] font-semibold text-accent-hover hover:text-ink"
        >
          Reset all filters
        </button>
      ) : null}
    </div>
  );
}
