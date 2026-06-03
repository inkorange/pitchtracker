"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

// (i) icon in a stat card header. Click opens a small popover with
// the card's explanation. Click outside, hit Esc, or tap the close
// button to dismiss. Popover portals to document.body so it escapes
// the card's overflow boundary and the stats area's scroll
// container — otherwise it gets clipped on mobile.
//
// Anchoring: the popover sticks to the icon's bounding rect (set
// once on open). We deliberately don't track on scroll/resize while
// open — the user is reading the content, not moving the page; if
// they do scroll the popover stays put which still reads as
// "attached to the card I clicked".

interface HelpButtonProps {
  /** Card name, shown as the popover header. Defaults to "About". */
  title?: string;
  /** Markdown-free explanation text. Plain paragraphs render with
   *  spacing; lists / formatting requires passing JSX. */
  children: ReactNode;
}

export function HelpButton({ title = "About", children }: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Capture the icon's screen position when the popover opens. We
  // anchor below the icon, right-aligned to it so the popover
  // doesn't spill off the screen on narrow mobile cards.
  function handleToggle() {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setAnchor({
        top: r.bottom + 6,
        left: r.right,
        width: r.width,
      });
    }
    setOpen((v) => !v);
  }

  const popover =
    open && anchor ? (
      <div
        ref={popRef}
        role="dialog"
        aria-label={title}
        className="fixed z-50 w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-white/15 bg-[#0d1623] shadow-2xl p-3 space-y-1.5"
        style={{
          top: anchor.top,
          // Right-aligned to the icon: shift left by popover width
          // (clamped to viewport). 320 = w-[20rem] max above.
          left: Math.max(
            12,
            Math.min(
              anchor.left - Math.min(320, window.innerWidth - 24),
              window.innerWidth - Math.min(320, window.innerWidth - 24) - 12,
            ),
          ),
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/55">
            {title}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-white/55 hover:text-white text-xs leading-none"
          >
            ✕
          </button>
        </div>
        <div className="text-[12px] text-white/85 leading-snug space-y-2">
          {children}
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-label={`${title} — explain`}
        aria-expanded={open}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-white/25 text-white/55 hover:text-white hover:border-white/55 transition-colors text-[9px] font-medium leading-none flex-shrink-0"
      >
        i
      </button>
      {mounted && popover ? createPortal(popover, document.body) : null}
    </>
  );
}
