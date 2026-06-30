"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

// Wrapper that lets the user collapse an absolutely-positioned info
// panel down to a compact summary, then expand it back.
//
// Used on the pitcher arsenal, compare, and at-bat replay views so all
// three share one "give me the whole 3D scene" escape hatch from the
// dark-navy info panel that anchors the left edge.
//
// State is local-only — not persisted across reloads or page changes.
// Each view starts expanded by default.
//
// Collapsed-mode rendering is driven by a React context rather than
// swapping children. The wrapper ALWAYS renders its children; bits of
// the children that should disappear when collapsed wrap themselves in
// <HiddenWhenCollapsed> (which reads the same context and returns null
// when collapsed). That lets each panel decide its own "summary": the
// pitcher card keeps the headshot + name + season picker visible, the
// compare panel keeps the two pitcher rows, the at-bat panel keeps the
// matchup header — and the bulkier filters / arsenal / matchups / stats
// content underneath collapses out of the way without rendering a
// separate eye-only restore button somewhere else on screen.

const CollapsedContext = createContext(false);

// Hook for content inside HidablePanel to read the collapsed state.
// Components outside a HidablePanel get `false` (i.e., they always
// render — safe default).
export function useHidablePanelCollapsed(): boolean {
  return useContext(CollapsedContext);
}

interface Props {
  children: ReactNode;
  positionClass: string;
  panelName?: string;
  // Optional data attribute applied to the wrapper div so external
  // observers (e.g. ResizeObserver-driven layouts that anchor content
  // below the panel) can still find the element while the panel
  // shrinks and grows on collapse/expand.
  dataAttribute?: string;
}

export function HidablePanel({
  children,
  positionClass,
  panelName = "panel",
  dataAttribute,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const extraAttrs: Record<string, string> = dataAttribute
    ? { [dataAttribute]: "" }
    : {};

  const actionLabel = collapsed ? `Show ${panelName}` : `Hide ${panelName}`;

  return (
    <CollapsedContext.Provider value={collapsed}>
      <div
        className={`${positionClass} pointer-events-auto`}
        {...extraAttrs}
      >
        {children}
        {/* Eye chip sticks OUT of the panel's top-right corner so it
            can't collide with header content (team logos, headshots)
            that anchor that corner on desktop. Mobile uses a smaller
            offset so the chip stays on-screen when the panel hugs the
            screen's right edge. Icon flips between eye-off (panel
            expanded → click to collapse) and eye-on (panel collapsed
            → click to expand). */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={actionLabel}
          aria-label={actionLabel}
          aria-expanded={!collapsed}
          className="absolute -top-1.5 -right-1.5 sm:-top-3 sm:-right-3 z-30 w-7 h-7 rounded-full bg-[#081a32]/85 backdrop-blur-md border border-white/15 hover:border-white/30 text-white/80 hover:text-white shadow-md flex items-center justify-center transition-all"
        >
          <EyeIcon open={collapsed} />
        </button>
      </div>
    </CollapsedContext.Provider>
  );
}

// Wrapper that returns null when its nearest HidablePanel parent is
// collapsed. Use this in the panel's children to mark "bulky content
// I want to disappear from the collapsed summary".
export function HiddenWhenCollapsed({ children }: { children: ReactNode }) {
  const collapsed = useHidablePanelCollapsed();
  if (collapsed) return null;
  return <>{children}</>;
}

function EyeIcon({ open = false }: { open?: boolean }) {
  // Lucide-style eye iconography. `open` = panel is collapsed → click
  // to expand → show-eye open icon. `closed` = panel is expanded →
  // click to hide → eye with slash.
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
