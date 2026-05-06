"use client";

import { useCallback } from "react";
import { PitcherSearch } from "@/components/search/PitcherSearch";

interface Props {
  slot: "a" | "b";
  otherId: number | null;
  placeholder?: string;
}

export function CompareSlotSearch({ slot, otherId, placeholder }: Props) {
  const buildHref = useCallback(
    (id: number) => {
      const sp = new URLSearchParams();
      if (slot === "a") {
        sp.set("a", String(id));
        if (otherId) sp.set("b", String(otherId));
      } else {
        if (otherId) sp.set("a", String(otherId));
        sp.set("b", String(id));
      }
      return `/compare?${sp.toString()}`;
    },
    [slot, otherId],
  );

  return <PitcherSearch placeholder={placeholder} resultHref={buildHref} />;
}
