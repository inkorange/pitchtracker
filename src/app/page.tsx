import { Suspense } from "react";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeTicker } from "@/components/home/HomeTicker";
import { FeatureSection } from "@/components/home/FeatureSection";
import { DailyPickStrip } from "@/components/home/DailyPickStrip";
import { Leaderboards } from "@/components/home/Leaderboards";
import { FilmRoom } from "@/components/home/FilmRoom";
import { AskSection } from "@/components/home/AskSection";
import { FeaturedStrip } from "@/components/home/FeaturedStrip";
import { StripFallback } from "@/components/home/StripFallback";

// ISR revalidate: rebuild the homepage's static HTML at most every
// 5 minutes so the daily picks / rankings pick up the daily cron's DB
// writes. Without this the page is pre-rendered once at deploy time.
export const revalidate = 300;

// Redesigned homepage — design/Main.dc.html + HomeMobile.dc.html.
// Section order per design/DESIGN.md §3: Nav → Hero → Ticker →
// Feature cards → Daily picks → Leaderboards → Film room → Ask →
// Featured pitchers → Footer (global, from the root layout).
//
// Each data section streams in independently via Suspense.
export default function Home() {
  return (
    <main className="min-h-screen bg-bg text-ink">
      <SiteHeader />
      <HomeHero />
      <Suspense fallback={<div className="h-11 md:h-12 bg-accent" />}>
        <HomeTicker />
      </Suspense>
      <Suspense fallback={<StripFallback rows={4} cols={2} rowHeight="h-[540px] max-md:h-16" />}>
        <FeatureSection />
      </Suspense>
      <Suspense fallback={<StripFallback title="Daily picks" rows={2} rowHeight="h-[150px]" />}>
        <DailyPickStrip />
      </Suspense>
      <Suspense fallback={<StripFallback title="Leaderboards" rows={6} cols={3} rowHeight="h-[320px]" />}>
        <Leaderboards />
      </Suspense>
      <Suspense fallback={null}>
        <FilmRoom />
      </Suspense>
      <AskSection />
      <Suspense fallback={<StripFallback title="Featured pitchers" rows={6} cols={3} />}>
        <FeaturedStrip />
      </Suspense>
    </main>
  );
}
