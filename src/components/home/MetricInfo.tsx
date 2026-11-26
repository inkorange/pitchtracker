"use client";

import { useEffect, useId, useRef, useState } from "react";

// "?" button that pops a tooltip on click. Hover-only tooltips don't
// work on touch devices, so click-to-toggle handles mobile + desktop
// uniformly. Click-outside and Escape both close the popover.
//
// Sizing follows the redesign: 32px on desktop, 44px touch target
// below md.
export function MetricInfo({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

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
        aria-describedby={open ? tipId : undefined}
        className="inline-flex items-center justify-center size-11 md:size-8 rounded-full border border-line-strong text-ink-2 text-sm hover:text-ink hover:border-muted transition-colors leading-none"
      >
        ?
      </button>
      {open ? (
        <span
          id={tipId}
          role="tooltip"
          className="absolute top-full mt-2 right-0 z-30 w-64 px-3.5 py-3 rounded-control bg-surface border border-line-strong shadow-xl text-[13px] leading-relaxed text-ink-2 whitespace-normal normal-case tracking-normal font-normal"
        >
          {description}
        </span>
      ) : null}
    </span>
  );
}
