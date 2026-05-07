"use client";

import { useSearchParams } from "next/navigation";
import { type ReactNode } from "react";

// Hides its children when at-bat mode is active (?abGame=…&abNum=…
// in the URL). Per-side filters (pitch type, hand, game, outcome)
// don't apply to at-bat playback, so collapsing them out of the
// pitcher card keeps the panel focused and frees vertical space
// for the matchups list above.
export function FiltersGate({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const inAtBat =
    params.get("abGame") != null && params.get("abNum") != null;
  if (inAtBat) return null;
  return <>{children}</>;
}
