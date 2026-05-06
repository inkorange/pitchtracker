"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";
import {
  getPitchColorForSide,
  getPitchLabel,
  type CompareSide,
} from "@/lib/viz/colors";

interface ArsenalEntry {
  pitch_type: string;
  pitch_count: number | null;
}

interface GameOption {
  game_pk: number;
  game_date: string;
  away: string;
  home: string;
}

interface CompareSideFiltersProps {
  side: CompareSide;
  availableSeasons: number[];
  arsenal: ArsenalEntry[];
  games: GameOption[];
}

export function CompareSideFilters({
  side,
  availableSeasons,
  arsenal,
  games,
}: CompareSideFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const seasonKey = `${side}Season`;
  const pitchKey = `${side}Pitch`;
  const gameKey = `${side}Game`;

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

  const currentSeason = Number(params.get(seasonKey)) || availableSeasons[0] || new Date().getFullYear();
  const activePitchTypes = (params.get(pitchKey) ?? "").split(",").filter(Boolean);
  const activeGame = params.get(gameKey) ?? "";

  const togglePitch = (type: string) => {
    const cur = new Set(activePitchTypes);
    if (cur.has(type)) cur.delete(type);
    else cur.add(type);
    update({ [pitchKey]: cur.size > 0 ? Array.from(cur).join(",") : null });
  };

  return (
    <div className="space-y-3">
      <TransitionOverlay isPending={isPending} />

      {availableSeasons.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">Season</span>
          <div className="flex gap-1 flex-wrap">
            {availableSeasons.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() =>
                  update({
                    [seasonKey]: String(s),
                    [gameKey]: null, // games are season-scoped
                  })
                }
                disabled={isPending}
                className={`px-2 py-0.5 text-[11px] tabular-nums rounded transition-colors ${
                  s === currentSeason
                    ? "bg-white/12 text-white"
                    : "text-white/55 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

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
                    style={{
                      background: getPitchColorForSide(a.pitch_type, side),
                      opacity: dim ? 0.3 : 1,
                    }}
                  />
                  {getPitchLabel(a.pitch_type)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {games.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-1.5">Game</div>
          <select
            value={activeGame}
            onChange={(e) => update({ [gameKey]: e.target.value || null })}
            className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-[11px] text-white/85 tabular-nums focus:outline-none focus:border-white/25"
          >
            <option value="">All games in {currentSeason}</option>
            {games.map((g) => (
              <option key={g.game_pk} value={g.game_pk}>
                {g.game_date} · {g.away} @ {g.home}
              </option>
            ))}
          </select>
        </div>
      )}

      {(activePitchTypes.length > 0 || activeGame) && (
        <button
          onClick={() => update({ [pitchKey]: null, [gameKey]: null })}
          className="text-[10px] uppercase tracking-[0.14em] text-white/40 hover:text-white/80 transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
