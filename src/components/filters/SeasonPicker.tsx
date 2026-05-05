"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface SeasonPickerProps {
  pitcherId: number;
  season: number;
  available: number[];
}

export function SeasonPicker({ pitcherId, season, available }: SeasonPickerProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const goto = (s: number) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("season", String(s));
    sp.delete("game"); // game ids are season-scoped
    startTransition(() => {
      router.push(`/pitcher/${pitcherId}?${sp.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">Season</span>
      <div className={`flex gap-1 transition-opacity ${isPending ? "opacity-60" : ""}`}>
        {available.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => goto(s)}
            disabled={isPending}
            className={`px-2 py-0.5 text-[11px] tabular-nums rounded transition-colors ${
              s === season
                ? "bg-white/12 text-white"
                : "text-white/55 hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {isPending && <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />}
    </div>
  );
}
