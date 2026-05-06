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
}

const Ctx = createContext<CompareHoverState>({
  hoveredSide: null,
  setHoveredSide: () => {},
});

export function CompareHoverProvider({ children }: { children: ReactNode }) {
  const [hoveredSide, setHoveredSideState] = useState<CompareSide | null>(null);
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

  const value = useMemo(() => ({ hoveredSide, setHoveredSide }), [hoveredSide, setHoveredSide]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompareHover(): CompareHoverState {
  return useContext(Ctx);
}

// Returns the opacity to apply to elements belonging to `side`. When some
// other side is hovered, this side dims to 0.25; when this side is hovered
// (or nothing is hovered), this side stays at 1.
export function useOpacityForSide(side: CompareSide): number {
  const { hoveredSide } = useCompareHover();
  if (hoveredSide === null || hoveredSide === side) return 1;
  return 0.25;
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
