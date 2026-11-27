"use client";

import { Spinner } from "./Spinner";

interface TransitionOverlayProps {
  isPending: boolean;
}

/** Full-screen "Updating…" while a filter change re-renders the page. */
export function TransitionOverlay({ isPending }: TransitionOverlayProps) {
  if (!isPending) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 bg-bg/50 backdrop-blur-[2px] flex items-center justify-center opacity-0 motion-safe:animate-[pt-fade-in_.2s_ease-out_.15s_forwards] motion-reduce:opacity-100"
    >
      <div className="flex items-center gap-3 px-5 py-3.5 rounded-panel bg-surface border border-line-strong shadow-2xl">
        <Spinner />
        <span className="font-display font-bold text-lg uppercase tracking-[0.5px] text-ink">Updating…</span>
      </div>
    </div>
  );
}
