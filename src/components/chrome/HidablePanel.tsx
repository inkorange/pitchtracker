"use client";

import { useState, type ReactNode } from "react";

// Wrapper that lets the user collapse an absolutely-positioned info
// panel down to a small floating eye-icon button, then bring it back.
// Used on the pitcher arsenal, compare, and at-bat replay views so all
// three give the user the same "give me the whole 3D scene" escape
// hatch from the dark-navy info panel that anchors the left edge.
//
// State is local-only — not persisted across reloads or page changes.
// Each view starts visible by default; the user toggles per session
// per view.
//
// The caller supplies two positioning strings:
//   - `positionClass` is the panel's outer wrapper anchor (used while
//     visible). Typically includes the responsive width + max-height
//     so the wrapper sizes match the panel inside.
//   - `hiddenPositionClass` is where the small restore button appears
//     when the panel is collapsed. Should mirror the same top + left
//     anchor as the panel so the button sits where the panel was.

interface Props {
  children: ReactNode;
  positionClass: string;
  hiddenPositionClass: string;
  panelName?: string;
  // Optional data attribute applied to BOTH the visible wrapper and the
  // hidden restore button so external observers (e.g. ResizeObserver-
  // driven layouts that anchor content below the panel) can still find
  // the element in both states.
  dataAttribute?: string;
}

export function HidablePanel({
  children,
  positionClass,
  hiddenPositionClass,
  panelName = "panel",
  dataAttribute,
}: Props) {
  const [hidden, setHidden] = useState(false);

  const extraAttrs: Record<string, string> = dataAttribute
    ? { [dataAttribute]: "" }
    : {};

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        title={`Show ${panelName}`}
        aria-label={`Show ${panelName}`}
        className={`${hiddenPositionClass} pointer-events-auto w-9 h-9 rounded-full bg-[#081a32]/85 backdrop-blur-md border border-white/15 hover:border-white/30 text-white/85 hover:text-white shadow-lg flex items-center justify-center transition-all`}
        {...extraAttrs}
      >
        <EyeIcon open />
      </button>
    );
  }

  return (
    <div className={`${positionClass} pointer-events-auto`} {...extraAttrs}>
      {children}
      {/* Hide button sticks OUT of the panel's top-right corner —
          slightly above + slightly right of the section so it can't
          collide with header content (team logos, headshots, etc.)
          that anchor that corner on desktop. Mobile uses a smaller
          offset so the button stays on-screen when the panel hugs
          the screen's right edge. Styled like the restore button
          (same navy chip + border + shadow) for visual symmetry. */}
      <button
        type="button"
        onClick={() => setHidden(true)}
        title={`Hide ${panelName}`}
        aria-label={`Hide ${panelName}`}
        className="absolute -top-1.5 -right-1.5 sm:-top-3 sm:-right-3 z-30 w-7 h-7 rounded-full bg-[#081a32]/85 backdrop-blur-md border border-white/15 hover:border-white/30 text-white/80 hover:text-white shadow-md flex items-center justify-center transition-all"
      >
        <EyeIcon />
      </button>
    </div>
  );
}

function EyeIcon({ open = false }: { open?: boolean }) {
  // Lucide-style eye iconography. `open` = visible state (used for the
  // "show panel" restore button); closed-eye = "hide panel".
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {open ? (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="m2 2 20 20" />
          <path d="M6.71 6.71C3.4 8.6 2 12 2 12s3 7 10 7c1.59 0 3-.34 4.22-.86" />
          <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
          <path d="M17.29 17.29C20.6 15.4 22 12 22 12s-3-7-10-7c-1 0-1.94.14-2.81.38" />
        </>
      )}
    </svg>
  );
}
