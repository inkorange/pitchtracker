"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { openAiChat } from "@/lib/ai/open-chat";
import { CommandPalette, openPalette } from "./CommandPalette";

// Site header — design/DESIGN.md §3 "Global nav".
// Desktop: wordmark, primary nav (active item underlined in accent),
// "Find a pitcher ⌘K" CTA that opens the pitcher search palette.
// Mobile: wordmark + search (palette) + menu (full-height sheet).

export type NavKey = "pitchers" | "teams" | "at-bat" | "explore";

const NAV: { key: NavKey; label: string; href: string }[] = [
  { key: "pitchers", label: "Pitchers", href: "/pitchers" },
  { key: "teams", label: "Teams", href: "/browse" },
  { key: "at-bat", label: "At-bat replays", href: "/at-bat" },
  { key: "explore", label: "Explore", href: "/explore" },
];

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold italic tracking-[0.5px] text-ink ${className}`}>
      PITCH<span className="text-accent">TRACKER</span>
    </span>
  );
}

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function SiteHeader({ active }: { active?: NavKey }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shortcut, setShortcut] = useState("⌘K");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform read after hydration
    if (!isMac()) setShortcut("Ctrl K");
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    // Lock page scroll behind the full-height sheet.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const askLink = (cls: string) => (
    <a
      href="/ai"
      onClick={(e) => {
        e.preventDefault();
        setMenuOpen(false);
        openAiChat();
      }}
      className={cls}
    >
      Ask PitchTracker
    </a>
  );

  return (
    <header className="relative md:sticky md:top-0 z-40 border-b border-line bg-bg-raised">
      <div className="container-page h-14 md:h-16 flex items-center gap-8">
        <Link href="/" aria-label="PitchTracker home" className="flex items-baseline hover:opacity-90">
          <Wordmark className="text-[26px] md:text-[30px]" />
        </Link>

        <nav aria-label="Primary" className="hidden md:flex gap-7 text-sm font-medium grow h-full">
          {NAV.map((n) =>
            n.key === active ? (
              <Link
                key={n.key}
                href={n.href}
                aria-current="page"
                className="h-full flex items-center pt-[3px] border-b-[3px] border-accent text-ink font-semibold hover:text-ink"
              >
                {n.label}
              </Link>
            ) : (
              <Link key={n.key} href={n.href} className="h-full flex items-center text-ink-2 hover:text-accent-hover">
                {n.label}
              </Link>
            ),
          )}
          {askLink("h-full flex items-center text-ink-2 hover:text-accent-hover")}
        </nav>
        <button
          type="button"
          onClick={openPalette}
          aria-keyshortcuts="Meta+K Control+K"
          className="hidden md:flex h-10 pl-4 pr-2 items-center gap-2.5 rounded-control bg-accent hover:bg-accent-hover text-white text-sm font-semibold"
        >
          Find a pitcher
          <kbd className="text-xs px-1.5 py-0.5 rounded-[3px] bg-black/25 font-sans">{shortcut}</kbd>
        </button>

        <div className="md:hidden ml-auto flex">
          <button
            type="button"
            aria-label="Find a pitcher"
            onClick={openPalette}
            className="size-11 flex items-center justify-center text-ink"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="size-11 flex items-center justify-center text-ink"
          >
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="mobile-menu"
          aria-label="Primary"
          className="md:hidden fixed inset-x-0 top-14 bottom-0 bg-bg-raised overflow-y-auto"
        >
          <ul className="list-none m-0 px-5 py-2 flex flex-col">
            {NAV.map((n) => (
              <li key={n.key}>
                <Link
                  href={n.href}
                  aria-current={n.key === active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center min-h-14 text-lg font-display font-bold uppercase tracking-[0.5px] border-b border-line ${
                    n.key === active ? "text-accent" : "text-ink"
                  }`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
            <li>
              {askLink(
                "flex items-center min-h-14 text-lg font-display font-bold uppercase tracking-[0.5px] text-ink border-b border-line",
              )}
            </li>
            <li className="py-4">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  openPalette();
                }}
                className="w-full flex h-12 items-center justify-center rounded-control bg-accent text-white font-semibold"
              >
                Find a pitcher
              </button>
            </li>
          </ul>
        </nav>
      ) : null}

      <CommandPalette />
    </header>
  );
}
