"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Wraps a chart card so it only mounts once it scrolls into view.
// Renders a same-height placeholder so the page layout doesn't reflow
// when each card swaps in. Once mounted, stays mounted — we don't
// want flicker if the user scrolls back.
//
// Used by every stat card below the headline, so the first paint of
// the Stats view is just the headline + per-pitch table; the heavier
// SVG charts come in as the user scrolls.
export function LazyMount({
  children,
  minHeight = 240,
  rootMargin = "200px",
}: {
  children: ReactNode;
  /** Placeholder height in px, so the layout doesn't jump. */
  minHeight?: number;
  /** Pre-load offset — start mounting when the card is this far below the viewport. */
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return;
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setMounted(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [mounted, rootMargin]);

  return (
    <div ref={ref} style={{ minHeight: mounted ? undefined : minHeight }}>
      {mounted ? children : null}
    </div>
  );
}
