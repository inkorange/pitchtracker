"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { HomeFeature } from "@/lib/home/feature-shapes";
import type { TunnelDiagram } from "@/lib/home/tunnel";
import { ArsenalVisual, AtBatVisual, SceneVisual, TunnelVisual } from "./FeatureVisuals";

// Expanding feature cards — design/FeatureExpand.dc.html (desktop)
// and FeatureExpandMobile.dc.html (accordion).
//
// Desktop: one card is always open (default 0). Hover or focus opens a
// card; leaving the row keeps the last-open one. Open = flex 2.6,
// idle = flex 1, animated on flex-grow. Same DOM idle and open — the
// visual band never swaps layout, extras fade in.
// Mobile: accordion, one open at a time.

export interface FeatureCardData {
  n: string;
  title: string;
  teaser: string;
  body: string;
  steps: string[];
  cta: string;
  href: string;
  /** Renders the 250px (220px mobile) visual band. */
  visual: (open: boolean) => ReactNode;
}

const FADE = "motion-safe:animate-[pt-fade_.35s_ease_.18s_both]";
const ACCORDION_MS = 350;

export function FeatureCards({ cards }: { cards: FeatureCardData[] }) {
  const [open, setOpen] = useState(0);
  const [mobileOpen, setMobileOpen] = useState<number | null>(0);
  // The panel that is animating closed keeps its visual mounted until
  // the collapse finishes, so the height animates instead of jumping.
  const [closing, setClosing] = useState<number | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const toggleMobile = (i: number) => {
    const prev = mobileOpen;
    setMobileOpen(prev === i ? null : i);
    if (prev !== null) {
      setClosing(prev);
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setClosing(null), ACCORDION_MS + 50);
    }
  };

  return (
    <>
      {/* Desktop row */}
      <div className="hidden md:flex gap-4 h-[540px]">
        {cards.map((c, i) => {
          const isOpen = i === open;
          return (
            <article
              key={c.n}
              onMouseEnter={() => setOpen(i)}
              onFocusCapture={() => setOpen(i)}
              className={`min-w-0 flex flex-col overflow-hidden rounded-panel bg-surface border border-t-[3px] motion-safe:transition-[flex-grow,border-color] motion-safe:duration-[400ms] motion-safe:ease-[cubic-bezier(.2,.7,.2,1)] ${
                isOpen
                  ? "grow-[2.6] basis-0 border-line-strong border-t-accent"
                  : "grow basis-0 border-line border-t-line-strong"
              }`}
            >
              <div className="relative h-[250px] shrink-0 overflow-hidden bg-bg-raised border-b border-line">
                {c.visual(isOpen)}
              </div>
              <div className="grow min-h-0 p-5 flex flex-col gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="font-display font-extrabold text-4xl text-accent leading-[0.9] shrink-0">
                    {c.n}
                  </span>
                  <h3 className="m-0 pt-[3px] font-display font-extrabold text-2xl leading-none uppercase text-ink">
                    {c.title}
                  </h3>
                </div>
                {isOpen ? (
                  <>
                    <p className={`m-0 text-sm leading-normal text-ink-2 ${FADE}`}>{c.body}</p>
                    <ol className={`mt-1 p-0 list-none grid grid-cols-3 gap-3 ${FADE}`}>
                      {c.steps.map((s, si) => (
                        <li key={si} className="flex flex-col gap-1.5 text-[13px] leading-[1.4] text-ink-2">
                          <StepBadge n={si + 1} accent />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                    <Link
                      href={c.href}
                      className={`mt-auto self-start h-10 px-4 rounded-control bg-accent text-white hover:text-white hover:bg-accent-hover text-sm font-bold flex items-center gap-2 ${FADE}`}
                    >
                      {c.cta} <span aria-hidden="true">→</span>
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="m-0 text-sm leading-normal text-ink-3">{c.teaser}</p>
                    <button
                      type="button"
                      aria-expanded={false}
                      aria-label={`Preview: ${c.title}`}
                      onClick={() => setOpen(i)}
                      className="mt-auto self-start h-9 pl-1.5 pr-3 rounded-full border border-line-strong text-ink-2 hover:text-ink text-[13px] font-semibold flex items-center gap-2"
                    >
                      <span
                        aria-hidden="true"
                        className="size-6 rounded-full bg-avatar flex items-center justify-center"
                      >
                        +
                      </span>
                      Preview
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Mobile accordion */}
      <div className="md:hidden flex flex-col gap-3">
        {cards.map((c, i) => {
          const isOpen = i === mobileOpen;
          const panelId = `feature-panel-${c.n}`;
          return (
            <article
              key={c.n}
              className={`rounded-panel bg-surface border border-t-[3px] overflow-hidden motion-safe:transition-colors motion-safe:duration-300 ${
                isOpen ? "border-line-strong border-t-accent" : "border-line border-t-line"
              }`}
            >
              <h3 className="m-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleMobile(i)}
                  className="w-full flex items-center gap-3.5 min-h-16 px-4 py-3 text-left text-ink"
                >
                  <span className="font-display font-extrabold text-[28px] text-accent leading-none">{c.n}</span>
                  <span className="grow font-display font-extrabold text-[22px] leading-none uppercase">
                    {c.title}
                  </span>
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    className={`text-ink-2 motion-safe:transition-transform motion-safe:duration-[350ms] ${isOpen ? "rotate-180" : ""}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </h3>
              {/* Height animates via grid-template-rows 0fr → 1fr. */}
              <div
                id={panelId}
                inert={!isOpen}
                className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-[350ms] motion-safe:ease-[cubic-bezier(.2,.7,.2,1)] ${
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div
                  className={`min-h-0 overflow-hidden motion-safe:transition-opacity motion-safe:duration-[350ms] ${
                    isOpen ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <div className="relative h-[220px] overflow-hidden bg-bg-raised border-y border-line">
                    {isOpen || closing === i ? c.visual(true) : null}
                  </div>
                  <div className="p-4 flex flex-col gap-3.5">
                    <p className="m-0 text-sm leading-[1.55] text-ink-2">{c.body}</p>
                    <span className="text-[11px] tracking-[1.5px] text-highlight font-bold uppercase">
                      How to use it
                    </span>
                    <ol className="m-0 p-0 list-none flex flex-col gap-2.5">
                      {c.steps.map((s, si) => (
                        <li key={si} className="flex gap-2.5 text-sm leading-[1.45]">
                          <StepBadge n={si + 1} />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                    <Link
                      href={c.href}
                      className="h-12 rounded-control bg-accent text-white hover:text-white text-[15px] font-bold flex items-center justify-center gap-2"
                    >
                      {c.cta} <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function StepBadge({ n, accent = false }: { n: number; accent?: boolean }) {
  return (
    <span
      className={`size-[22px] shrink-0 rounded-full flex items-center justify-center font-display font-bold text-sm ${
        accent ? "bg-accent text-white" : "bg-avatar text-ink"
      }`}
    >
      {n}
    </span>
  );
}

/** Builds the four cards from plain (serializable) server data. */
export function HomeFeatureCards({
  feature,
  tunnel,
}: {
  feature: HomeFeature;
  tunnel: TunnelDiagram | null;
}) {
  const { pitcher, monitorPitches, arsenal, atBat } = feature;
  const last = pitcher.name.split(" ").slice(-1)[0];
  const cards: FeatureCardData[] = [
    {
      n: "01",
      title: "Every pitch in 3D",
      teaser: "A whole season of pitches as real flight paths, from any camera.",
      body: "Statcast tracking rebuilt as real flight paths — every pitch a pitcher threw this season, on one field.",
      steps: [
        "Search any pitcher from the top bar.",
        "Pick a camera: Front, Back, Top or Side.",
        "Color the paths by pitch type or by outcome.",
      ],
      cta: `Open ${last} in 3D`,
      href: pitcher.href,
      visual: (open) => <SceneVisual pitches={monitorPitches} open={open} />,
    },
  ];
  if (tunnel) {
    cards.push({
      n: "02",
      title: "Tunnels you can see",
      teaser: "See where pitches share a lane out of the hand, and where they split.",
      body: "Overlay the arsenal and see where pitches share a lane out of the hand — and where they split.",
      steps: [
        "Open a pitcher and switch on Tunnel.",
        "Turn pitch types on and off from the Arsenal list.",
        "Watch where the paths separate before the plate.",
      ],
      cta: "See his tunnel",
      href: `${pitcher.href}?tun=true`,
      visual: () => <TunnelVisual diagram={tunnel} pitcherShort={pitcher.shortName} />,
    });
  }
  if (arsenal.length > 0) {
    cards.push({
      n: "03",
      title: "Arsenal at a glance",
      teaser: "Velocity, usage and counts per pitch, and the list filters the scene.",
      body: "Velocity, usage and pitch counts for every pitch type, and the list doubles as the scene filter.",
      steps: [
        "The Arsenal tab lists each pitch with velo and usage.",
        "Tap a pitch to show or hide it in the scene.",
        "Narrow further by batter side, outcome or game.",
      ],
      cta: "Explore the arsenal",
      href: pitcher.href,
      visual: (open) => <ArsenalVisual arsenal={arsenal} open={open} />,
    });
  }
  if (atBat && atBat.pitches.length > 0) {
    cards.push({
      n: "04",
      title: "Replay any at-bat",
      teaser: "Step through a plate appearance in the order the hitter saw it.",
      body: "Step through a plate appearance pitch by pitch, in the order the hitter saw it.",
      steps: [
        "Open the Games tab and pick a start.",
        "Choose an at-bat from the list.",
        "Step pitch by pitch with the zone map and count.",
      ],
      cta: "Watch an at-bat",
      href: atBat.href,
      visual: (open) => <AtBatVisual atBat={atBat} open={open} />,
    });
  }
  // Keep numbering contiguous if a data-dependent card dropped out.
  cards.forEach((c, i) => (c.n = String(i + 1).padStart(2, "0")));
  return <FeatureCards cards={cards} />;
}
