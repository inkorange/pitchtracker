"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import {
  getPitchColor,
  getPitchLabel,
  OUTCOME_COLORS,
  OUTCOME_LABELS,
  type OutcomeCategory,
} from "@/lib/viz/colors";
import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";

interface ArsenalEntry {
  pitch_type: string;
  pitch_count: number | null;
}

interface GameEntry {
  game_pk: number;
  game_date: string;
  away: string;
  home: string;
}

interface PitcherFiltersProps {
  arsenal: ArsenalEntry[];
  games: GameEntry[];
}

export function PitcherFilters({ arsenal, games }: PitcherFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const update = useCallback(
    (next: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      const qs = sp.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [params, pathname, router],
  );

  const activePitchTypes = (params.get("pitch") ?? "").split(",").filter(Boolean);
  const activeHand = params.get("hand") ?? "";
  const activeGame = params.get("game") ?? "";
  const activeOutcomes = (params.get("outcome") ?? "").split(",").filter(Boolean);

  const togglePitch = (type: string) => {
    const current = new Set(activePitchTypes);
    if (current.has(type)) current.delete(type);
    else current.add(type);
    update({ pitch: current.size > 0 ? Array.from(current).join(",") : null });
  };

  const toggleOutcome = (cat: OutcomeCategory) => {
    const current = new Set(activeOutcomes);
    if (current.has(cat)) current.delete(cat);
    else current.add(cat);
    update({ outcome: current.size > 0 ? Array.from(current).join(",") : null });
  };

  const setHand = (hand: string) => {
    update({ hand: hand === activeHand ? null : hand });
  };

  return (
    <div className="space-y-3">
      <TransitionOverlay isPending={isPending} />
      {arsenal.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-1.5">
            Pitch type
          </div>
          <div className="flex flex-wrap gap-1.5">
            {arsenal.map((a) => {
              const active = activePitchTypes.length === 0 || activePitchTypes.includes(a.pitch_type);
              const dim = activePitchTypes.length > 0 && !active;
              return (
                <button
                  key={a.pitch_type}
                  onClick={() => togglePitch(a.pitch_type)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] tabular-nums transition-colors ${
                    dim
                      ? "bg-white/[0.02] text-white/35 border border-white/5"
                      : "bg-white/[0.06] text-white/85 border border-white/10 hover:bg-white/[0.1]"
                  }`}
                  aria-pressed={!dim}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: getPitchColor(a.pitch_type), opacity: dim ? 0.3 : 1 }}
                  />
                  {getPitchLabel(a.pitch_type)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-1.5">
          Outcome
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["whiff", "called", "ball", "foul", "inplay"] as const).map((cat) => {
            const active = activeOutcomes.length === 0 || activeOutcomes.includes(cat);
            const dim = activeOutcomes.length > 0 && !active;
            return (
              <button
                key={cat}
                onClick={() => toggleOutcome(cat)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-colors ${
                  dim
                    ? "bg-white/[0.02] text-white/35 border border-white/5"
                    : "bg-white/[0.06] text-white/85 border border-white/10 hover:bg-white/[0.1]"
                }`}
                aria-pressed={!dim}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: OUTCOME_COLORS[cat], opacity: dim ? 0.3 : 1 }}
                />
                {OUTCOME_LABELS[cat]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-1.5">
          Batter side
        </div>
        <div className="flex gap-1">
          {[
            { key: "", label: "Both" },
            { key: "L", label: "vs LHB" },
            { key: "R", label: "vs RHB" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setHand(opt.key)}
              className={`px-2.5 py-1 rounded text-[11px] uppercase tracking-[0.1em] transition-colors ${
                activeHand === opt.key
                  ? "bg-white/12 text-white"
                  : "bg-white/[0.04] text-white/55 hover:text-white hover:bg-white/[0.08]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {games.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-1.5">Game</div>
          <select
            value={activeGame}
            onChange={(e) => update({ game: e.target.value || null })}
            className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-[11px] text-white/85 tabular-nums focus:outline-none focus:border-white/25"
          >
            <option value="">All cached games ({games.length})</option>
            {games.map((g) => (
              <option key={g.game_pk} value={g.game_pk}>
                {g.game_date} · {g.away} @ {g.home}
              </option>
            ))}
          </select>
        </div>
      )}

      {(activePitchTypes.length > 0 ||
        activeHand ||
        activeGame ||
        activeOutcomes.length > 0) && (
        <button
          onClick={() =>
            update({ pitch: null, hand: null, game: null, outcome: null })
          }
          className="text-[10px] uppercase tracking-[0.14em] text-white/40 hover:text-white/80 transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
