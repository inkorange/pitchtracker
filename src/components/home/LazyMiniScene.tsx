"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ComponentProps } from "react";
import type MiniSceneType from "./MiniScene";

const MiniScene = dynamic(() => import("./MiniScene"), { ssr: false });

type MiniSceneProps = Omit<ComponentProps<typeof MiniSceneType>, "paused">;

/**
 * Mounts the WebGL MiniScene the first time its box nears the
 * viewport, then pauses the render loop whenever it's scrolled out of
 * view. `fallback` (a poster) shows until the canvas mounts.
 * The canvas ignores pointer input so the page scrolls over it.
 */
export function LazyMiniScene({
  fallback,
  className = "",
  ...sceneProps
}: MiniSceneProps & { fallback?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) setMounted(true);
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`absolute inset-0 ${className}`}>
      {fallback}
      {mounted ? (
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <MiniScene {...sceneProps} paused={!visible} />
        </div>
      ) : null}
    </div>
  );
}
