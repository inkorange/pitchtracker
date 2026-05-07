"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CompareSide } from "@/lib/viz/colors";

interface CompareHoverState {
  hoveredSide: CompareSide | null;
  setHoveredSide: (side: CompareSide | null) => void;
  // Persistent "this side has a pitch/average selected" — driven by
  // 3D scene clicks. Used to glow the matching pitcher card above.
  selectedSide: CompareSide | null;
  setSelectedSide: (side: CompareSide | null) => void;
}

const Ctx = createContext<CompareHoverState>({
  hoveredSide: null,
  setHoveredSide: () => {},
  selectedSide: null,
  setSelectedSide: () => {},
});

export function CompareHoverProvider({ children }: { children: ReactNode }) {
  const [hoveredSide, setHoveredSideState] = useState<CompareSide | null>(null);
  const [selectedSide, setSelectedSide] = useState<CompareSide | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Defer "clear" by a tick so a pointerout on one mesh followed
  // immediately by a pointerover on the next mesh doesn't flicker — the
  // pointerover cancels the pending clear.
  const setHoveredSide = useCallback((side: CompareSide | null) => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    if (side === null) {
      clearTimer.current = setTimeout(() => {
        setHoveredSideState(null);
        clearTimer.current = null;
      }, 16);
    } else {
      setHoveredSideState(side);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const value = useMemo(
    () => ({ hoveredSide, setHoveredSide, selectedSide, setSelectedSide }),
    [hoveredSide, setHoveredSide, selectedSide, setSelectedSide],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompareHover(): CompareHoverState {
  return useContext(Ctx);
}

// Returns the opacity to apply to elements belonging to `side`. When some
// other side is hovered, this side dims to 0.1 — strong enough that the
// hovered pitcher's pitches are unmistakably their own.
export function useOpacityForSide(side: CompareSide): number {
  const { hoveredSide } = useCompareHover();
  if (hoveredSide === null || hoveredSide === side) return 1;
  return 0.1;
}

interface HoverableSideProps {
  side: CompareSide;
  children: ReactNode;
  className?: string;
}

export function HoverableSide({ side, children, className }: HoverableSideProps) {
  const { setHoveredSide } = useCompareHover();
  return (
    <div
      onMouseEnter={() => setHoveredSide(side)}
      onMouseLeave={() => setHoveredSide(null)}
      className={className}
    >
      {children}
    </div>
  );
}

// Side-specific ring around the headshot when this side is selected
// in the 3D scene. Tailwind's `ring` doesn't affect layout (it's
// painted outside the box via box-shadow), so toggling it doesn't
// shift any neighboring elements. A → red-tinted, B → cyan-tinted,
// matching the Phase-3 hue offset on the pitch ribbons.
const HEADSHOT_RING: Record<CompareSide, string> = {
  a: "ring-2 ring-rose-300/80 ring-offset-2 ring-offset-[#081a32] shadow-[0_0_18px_rgba(244,114,182,0.55)]",
  b: "ring-2 ring-cyan-300/80 ring-offset-2 ring-offset-[#081a32] shadow-[0_0_18px_rgba(103,232,249,0.55)]",
};

/**
 * Returns the Tailwind classes to slap on a side's headshot wrapper
 * to highlight it when a pitch from that side is selected in the 3D
 * scene. Empty string when not selected — no class flip, no layout
 * shift.
 */
export function useSelectedHeadshotRingClass(side: CompareSide): string {
  const { selectedSide } = useCompareHover();
  return selectedSide === side ? HEADSHOT_RING[side] : "";
}

/**
 * Client wrapper around a headshot's container div that picks up the
 * selection state from context. Matches the existing inline div the
 * pitcher cards used (`relative w-12 h-12 rounded-full bg-white/5
 * overflow-hidden flex-shrink-0`) but adds the side-keyed ring when
 * selected. The ring sits on the OUTSIDE via Tailwind's box-shadow
 * trick so it doesn't shift the surrounding text.
 */
export function SelectableHeadshotFrame({
  side,
  children,
}: {
  side: CompareSide;
  children: ReactNode;
}) {
  const ringClass = useSelectedHeadshotRingClass(side);
  return (
    <div
      className={`relative w-12 h-12 rounded-full bg-white/5 flex-shrink-0 transition-shadow ${ringClass}`}
    >
      <div className="absolute inset-0 rounded-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}
