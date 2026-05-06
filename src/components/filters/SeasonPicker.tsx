"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";

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
      <TransitionOverlay isPending={isPending} />
      <span className="text-[10px] uppercase tracking-[0.14em] text-white/45 flex-shrink-0">
        Season
      </span>
      <div className="flex gap-1 overflow-x-auto flex-1 min-w-0 scrollbar-thin">
        {available.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => goto(s)}
            disabled={isPending}
            className={`flex-shrink-0 px-2 py-0.5 text-[11px] tabular-nums rounded transition-colors ${
              s === season
                ? "bg-white/12 text-white"
                : "text-white/55 hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
