"use client";

import Link from "next/link";
import { CommandPalette, openPalette } from "@/components/chrome/CommandPalette";
import { Wordmark } from "@/components/chrome/SiteHeader";
import { openAiChat } from "@/lib/ai/open-chat";

/** Desktop pitcher-page top bar (56px) — design/Pitcher.dc.html. */
export function PitcherTopBar({ name, compareHref }: { name: string; compareHref: string }) {
  return (
    <header className="hidden lg:flex absolute inset-x-0 top-0 h-14 z-30 items-center gap-5 px-5 bg-bg-raised border-b border-line">
      <Link href="/" aria-label="PitchTracker home" className="hover:opacity-90">
        <Wordmark className="text-[26px]" />
      </Link>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="list-none m-0 p-0 flex gap-2">
          <li>
            <Link href="/pitchers" className="text-muted hover:text-accent-hover">
              Pitchers
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-ink truncate max-w-[280px]">
            {name}
          </li>
        </ol>
      </nav>
      <span className="grow" />
      <button
        type="button"
        onClick={openPalette}
        aria-keyshortcuts="Meta+K Control+K"
        className="h-9 w-[240px] px-3 flex items-center gap-2 rounded-control border border-line-strong bg-surface text-sm text-muted hover:border-ink-2"
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="grow text-left">Search a pitcher</span>
        <kbd className="text-[11px] px-1.5 rounded border border-line-strong">⌘K</kbd>
      </button>
      <button
        type="button"
        onClick={() => openAiChat()}
        className="h-9 px-3 flex items-center gap-1.5 rounded-control border border-line-strong text-sm font-semibold text-ink hover:border-ink-2"
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6z" />
        </svg>
        Ask
      </button>
      <Link
        href={compareHref}
        className="h-9 px-3 flex items-center rounded-control border border-line-strong text-sm font-semibold text-ink hover:text-ink hover:border-ink-2"
      >
        Compare
      </Link>
      <CommandPalette />
    </header>
  );
}
