import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

// Shared top nav for every product surface. Anchored at the top of
// the viewport with a 75% black backdrop so it reads cleanly over
// either a 3D canvas (compare / at-bat / pitcher) or a static page
// (browse / daily / etc.). No pill backgrounds on individual links —
// the bar itself is the affordance.

interface TopNavProps {
  // Back affordance: e.g., { href: "/at-bat/12345", label: "Game" }.
  // Omit on root surfaces.
  back?: { href: string; label: string };
  // Right-aligned page title — short label like "At-bat replay".
  title?: string;
  // Contextual summary string rendered to the LEFT of the title on
  // desktop only (e.g. "All strikeouts from 2026-04-27 vs Boston Red Sox").
  // Hidden on mobile; pages should render their own mobile variant.
  summary?: ReactNode;
  // Optional right-side slot for a contextual action (e.g., the
  // compare page's Copy-link button). Sits between the title and the
  // right edge.
  rightSlot?: ReactNode;
}

export function TopNav({ back, title, summary, rightSlot }: TopNavProps) {
  return (
    <header className="fixed top-0 inset-x-0 z-30 flex items-center justify-between gap-3 px-3 sm:px-6 h-12 bg-black/75 backdrop-blur-md border-b border-white/10 pointer-events-auto">
      <div className="flex items-center gap-4 sm:gap-5 min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="text-[11px] uppercase tracking-[0.14em] text-white/70 hover:text-white transition-colors flex-shrink-0"
          >
            ← {back.label}
          </Link>
        ) : null}
        <Link
          href="/"
          className="inline-flex items-center flex-shrink-0"
          aria-label="pitchtracker home"
        >
          <Image
            src="/pitchtracker-logo.svg"
            alt="pitchtracker"
            width={65}
            height={20}
            className="h-5 w-auto"
          />
        </Link>
      </div>
      <div className="flex items-center gap-3 min-w-0">
        {summary ? (
          <div className="hidden sm:block text-[12px] text-white/70 italic truncate max-w-[36rem]">
            {summary}
          </div>
        ) : null}
        {title ? (
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/60 truncate">
            {title}
          </div>
        ) : null}
        {rightSlot}
      </div>
    </header>
  );
}
