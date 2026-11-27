"use client";

import { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import { Spinner } from "./Spinner";

/**
 * Full-screen loading overlay while the enclosing <Link>'s navigation is
 * pending. Render it as a child of the Link. Some destinations (at-bat
 * replays, pitcher pages) render on the server from a cold Savant read
 * and can take a few seconds; without this the click looks ignored.
 *
 * The overlay fades in after 150ms, so fast navigations never flash it.
 * Portalled to <body> so a table cell's overflow/stacking can't clip it.
 */
export function NavPendingOverlay({ label = "Loading…" }: { label?: string }) {
  const { pending } = useLinkStatus();
  if (!pending || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/70 backdrop-blur-sm opacity-0 motion-safe:animate-[pt-fade-in_.2s_ease-out_.15s_forwards] motion-reduce:opacity-100"
    >
      <div className="flex items-center gap-3 px-5 py-4 rounded-panel bg-surface border border-line-strong shadow-2xl text-ink">
        <Spinner className="size-6" />
        <span className="font-display font-bold text-xl uppercase tracking-[0.5px]">{label}</span>
      </div>
    </div>,
    document.body,
  );
}
