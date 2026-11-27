"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

/**
 * Read / update the pitcher page's URL filters. The page is a server
 * component that reads these params, so updates are real navigations
 * (router.push), wrapped in a transition so callers can show progress.
 */
export function usePitcherUrl() {
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

  const list = (key: string) => (params.get(key) ?? "").split(",").filter(Boolean);

  return { params, update, isPending, list };
}

/** Ask the rail to switch tabs (e.g. "+ Add filter" on the scene). */
export const RAIL_TAB_EVENT = "pitchtracker:rail-tab";
export type RailTab = "arsenal" | "filters" | "games" | "matchups";
export function openRailTab(tab: RailTab) {
  window.dispatchEvent(new CustomEvent<RailTab>(RAIL_TAB_EVENT, { detail: tab }));
}
