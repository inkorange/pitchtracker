"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { clampVisible, settleSnap } from "./snap";

// Non-modal bottom sheet with three snap points (peek / half / full) —
// the mobile pitcher drawer (design/MobileSheetPeek + MobileSheetFilters,
// DESIGN.md §3 "Pitcher page — mobile").
//
// - Drag the handle/header to move it; it settles on the nearest snap,
//   or one step in the direction of a quick flick.
// - The handle is a real button: tap (or Enter/Space) steps open, and
//   wraps from full back to peek. Escape collapses to peek.
// - Non-modal: the 3D scene above stays interactive at every snap.
// - z-[45]: above the scene's own controls (camera pad etc. are z-40)
//   so an open sheet covers them, below dialogs/palette (z-50+).

export const PEEK_PX = 248;
/** Distance from the top of the viewport when fully open. */
export const FULL_TOP_PX = 150;

function snapsFor(vh: number): number[] {
  const full = Math.max(vh - FULL_TOP_PX, PEEK_PX + 120);
  const half = Math.min(Math.max(Math.round(vh * 0.55), PEEK_PX + 60), full - 60);
  return [PEEK_PX, half, full];
}

export type SnapIndex = 0 | 1 | 2;

export function BottomSheet({
  index,
  onIndexChange,
  header,
  children,
  label,
  className = "",
  dismissed = false,
}: {
  index: SnapIndex;
  onIndexChange: (i: SnapIndex) => void;
  /** Rendered under the handle; dragging it moves the sheet too. */
  header: ReactNode;
  children: ReactNode;
  label: string;
  className?: string;
  /** Slide fully off-screen (e.g. the mobile Stats view, where the
   *  page scrolls on its own and the sheet only opens for filters). */
  dismissed?: boolean;
}) {
  const [snaps, setSnaps] = useState<number[]>([PEEK_PX, 460, 690]);
  const [drag, setDrag] = useState<number | null>(null); // visible px while dragging
  const start = useRef<{ y: number; visible: number; t: number; lastY: number; lastT: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    const update = () => setSnaps(snapsFor(window.innerHeight));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && index > 0) onIndexChange(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, onIndexChange]);

  const max = snaps[snaps.length - 1];
  const visible = drag ?? snaps[index];

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      // Let buttons inside the header (tabs, etc.) handle their own taps.
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      start.current = { y: e.clientY, visible: snaps[index], t: e.timeStamp, lastY: e.clientY, lastT: e.timeStamp };
      moved.current = false;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [snaps, index],
  );
  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const s = start.current;
      if (!s) return;
      const dy = s.y - e.clientY;
      if (Math.abs(dy) > 4) moved.current = true;
      if (!moved.current) return;
      s.lastY = e.clientY;
      s.lastT = e.timeStamp;
      setDrag(clampVisible(s.visible + dy, snaps));
    },
    [snaps],
  );
  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || !moved.current) {
        setDrag(null);
        return;
      }
      const dt = Math.max(e.timeStamp - s.lastT, 1);
      // px/ms, positive = upward (opening). Uses the last move segment.
      const velocity = (s.lastY - e.clientY) / dt || (s.y - e.clientY) / Math.max(e.timeStamp - s.t, 1);
      const next = settleSnap(clampVisible(s.visible + (s.y - e.clientY), snaps), velocity, snaps, index) as SnapIndex;
      setDrag(null);
      onIndexChange(next);
    },
    [snaps, index, onIndexChange],
  );

  return (
    <section
      aria-label={label}
      className={`fixed inset-x-0 bottom-0 z-[45] flex flex-col bg-bg-raised border-t border-line-strong rounded-t-drawer shadow-[0_-12px_32px_rgba(0,0,0,0.45)] ${
        drag == null ? "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(.2,.7,.2,1)]" : ""
      } ${className}`}
      style={{ height: max, transform: `translateY(${dismissed ? max + 24 : max - visible}px)`, touchAction: "none" }}
      inert={dismissed}
      aria-hidden={dismissed || undefined}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="shrink-0 select-none"
        style={{ touchAction: "none" }}
      >
        <button
          type="button"
          aria-label={index === 2 ? "Collapse panel" : "Expand panel"}
          aria-expanded={index > 0}
          onClick={() => {
            if (moved.current) return; // a drag, not a tap
            onIndexChange(((index + 1) % 3) as SnapIndex);
          }}
          className="w-full h-6 flex items-center justify-center"
        >
          <span aria-hidden="true" className="w-10 h-1 rounded-full bg-line-strong" />
        </button>
        {header}
      </div>
      {/* Body scrolls on its own; vertical pans here scroll, not drag. */}
      <div className="grow min-h-0 flex flex-col" style={{ touchAction: "pan-y" }}>
        {children}
      </div>
    </section>
  );
}
