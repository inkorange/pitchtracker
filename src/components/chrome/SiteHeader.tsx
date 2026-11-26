"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { openAiChat } from "@/lib/ai/open-chat";

// Redesign site header — design/Main.dc.html "NAV" + HomeMobile.
// Desktop: wordmark, primary nav, "Open the tracker" CTA.
// Mobile: wordmark + Search (jumps to the hero search) + Menu
// (disclosure panel with the same links).

const NAV = [
  { label: "Pitchers", href: "/explore" },
  { label: "Teams", href: "/browse" },
  { label: "At-bat replays", href: "/at-bat" },
  { label: "Leaders", href: "/strikeout_leaders" },
] as const;

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold italic tracking-[0.5px] text-ink ${className}`}>
      PITCH<span className="text-accent">TRACKER</span>
    </span>
  );
}

function focusHeroSearch() {
  const input = document.querySelector<HTMLInputElement>("[data-hero-search] input");
  if (!input) return false;
  input.scrollIntoView({ behavior: "smooth", block: "center" });
  input.focus({ preventScroll: true });
  return true;
}

export function SiteHeader({ trackerHref }: { trackerHref: string }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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

        <nav aria-label="Primary" className="hidden md:flex gap-7 text-sm font-medium grow">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-ink-2 hover:text-accent-hover">
              {n.label}
            </Link>
          ))}
          {askLink("text-ink-2 hover:text-accent-hover")}
        </nav>
        <Link
          href={trackerHref}
          className="hidden md:flex h-10 px-[18px] items-center rounded-control bg-accent text-white hover:text-white hover:bg-accent-hover text-sm font-semibold"
        >
          Open the tracker
        </Link>

        <div className="md:hidden ml-auto flex">
          <button
            type="button"
            aria-label="Search pitchers"
            onClick={() => {
              if (!focusHeroSearch()) window.location.href = "/explore";
            }}
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
          className="md:hidden absolute inset-x-0 top-full bg-bg-raised border-b border-line shadow-2xl"
        >
          <ul className="list-none m-0 px-5 py-2 flex flex-col">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center min-h-12 text-base font-medium text-ink border-b border-line"
                >
                  {n.label}
                </Link>
              </li>
            ))}
            <li>{askLink("flex items-center min-h-12 text-base font-medium text-ink border-b border-line")}</li>
            <li className="py-3">
              <Link
                href={trackerHref}
                onClick={() => setMenuOpen(false)}
                className="flex h-12 items-center justify-center rounded-control bg-accent text-white hover:text-white font-semibold"
              >
                Open the tracker
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
