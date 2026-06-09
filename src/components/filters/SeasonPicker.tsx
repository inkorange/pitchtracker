"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const goto = (s: number) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("season", String(s));
    sp.delete("game"); // game ids are season-scoped
    // Keep the current pathname (which already includes the slug
    // segment, e.g. /pitcher/694973/paul-skenes) instead of pushing
    // back to the id-only form — pushing to /pitcher/{id} would
    // 308-redirect and momentarily strip the slug from the URL bar.
    // Fall back to id-only if pathname is unexpectedly missing.
    const path = pathname ?? `/pitcher/${pitcherId}`;
    startTransition(() => {
      router.push(`${path}?${sp.toString()}`, { scroll: false });
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
