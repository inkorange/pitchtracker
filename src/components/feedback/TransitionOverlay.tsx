"use client";

interface TransitionOverlayProps {
  isPending: boolean;
}

// Full-screen overlay shown during a router transition. Lives outside any
// flow-layout panel so toggling it on/off doesn't cause layout shift.
export function TransitionOverlay({ isPending }: TransitionOverlayProps) {
  if (!isPending) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] flex items-center justify-center"
    >
      <div className="bg-[#11161e] border border-white/10 rounded-md px-5 py-3 flex items-center gap-3 shadow-2xl">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-white/60 animate-pulse" />
        <span className="text-[11px] uppercase tracking-[0.16em] text-white/85">
          Updating…
        </span>
      </div>
    </div>
  );
}
