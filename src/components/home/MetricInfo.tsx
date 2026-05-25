"use client";

import { useEffect, useRef, useState } from "react";

// Small ⓘ button that pops a styled tooltip on click. Hover-only
// tooltips don't work on touch devices, so click-to-toggle handles
// mobile + desktop uniformly. Click-outside and Escape both close
// the popover.
export function MetricInfo({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] font-semibold text-white/75 hover:text-white transition-colors leading-none"
      >
        ?
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute top-6 right-0 z-30 w-56 px-3 py-2 rounded-md bg-black/90 backdrop-blur-sm border border-white/15 shadow-xl text-[11px] leading-relaxed text-white/90 whitespace-normal pointer-events-none"
        >
          {description}
        </span>
      ) : null}
    </span>
  );
}
