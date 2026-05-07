"use client";

import { useState, type ReactNode } from "react";
import { parseAsInteger, useQueryStates } from "nuqs";
import { MobileCollapse } from "@/components/chrome/MobileCollapse";

// Wraps the mobile-collapsing pitcher card so we can auto-close it
// whenever the user picks an at-bat (`?abGame` + `?abNum` flip on or
// change to a new pair). Pulls focus to the 3D playback without the
// user having to manually tap the chevron. The user can still open
// the card back up at any time.
//
// We track the previous AB tuple in a setState-during-render
// comparator to dodge the React Compiler's set-state-in-effect
// warning while keeping the close trigger purely declarative.
export function PitcherCardCollapse({
  header,
  body,
}: {
  header: ReactNode;
  body: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [{ abGame, abNum }] = useQueryStates({
    abGame: parseAsInteger,
    abNum: parseAsInteger,
  });
  const currentAb =
    abGame != null && abNum != null ? `${abGame}-${abNum}` : null;
  const [prevAb, setPrevAb] = useState<string | null>(currentAb);
  if (currentAb !== prevAb) {
    setPrevAb(currentAb);
    if (currentAb != null) setOpen(false);
  }
  return (
    <MobileCollapse
      header={header}
      body={body}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
