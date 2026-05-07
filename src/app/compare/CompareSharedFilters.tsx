"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { TransitionOverlay } from "@/components/feedback/TransitionOverlay";
import { MobileCollapse } from "@/components/chrome/MobileCollapse";
import {
  OUTCOME_COLORS,
  OUTCOME_LABELS,
  type OutcomeCategory,
} from "@/lib/viz/colors";

// Batter side + outcome are SHARED across both pitchers — the whole
// point of compare mode is to look at both arsenals against the same
// situational filters. URL keys are unprefixed (`hand`, `outcome`)
// rather than per-side `aHand`/`bHand`.
export function CompareSharedFilters() {
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

  const activeHand = params.get("hand") ?? "";
  const activeOutcomes = (params.get("outcome") ?? "").split(",").filter(Boolean);

  // Compact summary for the collapsed mobile state — gives the user
  // a hint of what's set without expanding.
  const summaryParts: string[] = [];
  summaryParts.push(activeHand ? `vs ${activeHand}HB` : "Any side");
  if (activeOutcomes.length > 0)
    summaryParts.push(
      activeOutcomes
        .map((c) => OUTCOME_LABELS[c as OutcomeCategory] ?? c)
        .join(", "),
    );
  else summaryParts.push("All outcomes");
  const summary = summaryParts.join(" · ");

  const toggleOutcome = (cat: OutcomeCategory) => {
    const cur = new Set(activeOutcomes);
    if (cur.has(cat)) cur.delete(cat);
    else cur.add(cat);
    update({ outcome: cur.size > 0 ? Array.from(cur).join(",") : null });
  };

  return (
    <div className="space-y-3">
      <TransitionOverlay isPending={isPending} />

      <MobileCollapse
        size="compact"
        ariaLabel="Toggle batter side and outcome filters"
        header={
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
              Filters
            </div>
            <div className="text-[11px] text-white/85 truncate sm:hidden">
              {summary}
            </div>
          </div>
        }
        body={
          <>
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
              onClick={() => update({ hand: opt.key === activeHand ? null : opt.key })}
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
          </>
        }
      />
    </div>
  );
}
