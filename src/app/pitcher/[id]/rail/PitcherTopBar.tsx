"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAtBatNav } from "../atbat/AtBatRail";
import { shareAtBat, useAtBatInfo } from "../atbat/useAtBatInfo";
import { openPalette } from "@/components/chrome/CommandPalette";
import { Wordmark } from "@/components/chrome/SiteHeader";
import { openAiChat } from "@/lib/ai/open-chat";

/** Desktop pitcher-page top bar (56px) — design/Pitcher.dc.html. */
export function PitcherTopBar({ name, season, compareHref }: { name: string; season: number; compareHref: string }) {
  const sp = useSearchParams();
  const inAtBat = sp.has("abGame") && sp.has("abNum");
  const info = useAtBatInfo(season);
  const nav = useAtBatNav();
  const [copied, setCopied] = useState(false);
  const abLabel = inAtBat
    ? `At-bat #${sp.get("abNum")}${info?.batterName ? ` vs ${info.batterName}` : ""}`
    : null;
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
          {abLabel ? (
            <>
              <li>
                <button type="button" onClick={nav.exit} className="text-muted hover:text-accent-hover">
                  {name}
                </button>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-ink truncate max-w-[360px]">
                {abLabel}
              </li>
            </>
          ) : (
            <li aria-current="page" className="text-ink truncate max-w-[280px]">
              {name}
            </li>
          )}
        </ol>
      </nav>
      <span className="grow" />
      {inAtBat ? (
        <>
          <span role="status" className={copied ? "text-sm text-highlight" : "sr-only"}>
            {copied ? "Link copied" : ""}
          </span>
          <button
            type="button"
            onClick={async () => {
              if ((await shareAtBat(`${name}${abLabel ? ` · ${abLabel}` : ""}`)) === "copied") {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            className="h-9 px-3.5 rounded-control border border-line-strong text-[13px] font-semibold text-ink hover:border-ink-2"
          >
            Share at-bat
          </button>
          <button
            type="button"
            onClick={nav.exit}
            className="h-9 px-3.5 flex items-center gap-2 rounded-control border border-line-strong text-[13px] font-semibold text-ink hover:border-ink-2"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            Exit at-bat
          </button>
        </>
      ) : (
        <>
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
        </>
      )}
    </header>
  );
}
