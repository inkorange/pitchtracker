import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { PitcherSearch } from "@/components/search/PitcherSearch";
import { FeaturedStrip } from "@/components/home/FeaturedStrip";
import { DailyPickStrip } from "@/components/home/DailyPickStrip";
import { RankingsStrip } from "@/components/home/RankingsStrip";
import { YesterdayGamesStrip } from "@/components/home/YesterdayGamesStrip";
import { StripFallback } from "@/components/home/StripFallback";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90">
      {/* Full-width field banner. Capped at 25vh with a min so it
          doesn't squish on very short viewports. Logos + description
          are flex-centered inside, so they always land ON the image
          regardless of screen height. A bottom gradient softens the
          edge into the page background. */}
      <section className="relative w-full h-[25vh] min-h-[180px] overflow-hidden">
        <Image
          src="/field-background.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-[#0a0e14] pointer-events-none" />
        <header className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="flex items-center justify-center gap-4">
            <Image
              src="/Major_League_Baseball_logo.svg"
              alt=""
              width={75}
              height={40}
              className="h-10 w-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
              priority
            />
            <Image
              src="/pitchtracker-logo.svg"
              alt="PitchTracker"
              width={290}
              height={50}
              className="h-10 sm:h-20 w-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
              priority
            />
          </h1>
          <p className="px-[60px] text-base sm:text-lg text-white/95 leading-relaxed max-w-prose drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
            MLB pitch trajectories in 3D. Search a pitcher, browse by team, or
            replay any at-bat pitch-by-pitch.
          </p>
        </header>
      </section>

      <div className="max-w-4xl mx-auto px-6 pt-8 pb-16 space-y-10">
        {/* Sticky so the search stays reachable as the user scrolls
            through the daily pick + featured strips. -mx-6 px-6
            extends the backdrop to the container edges so scrolled
            content underneath doesn't bleed through. */}
        <div className="sticky top-2 z-20 -mx-6 px-6 py-3 bg-[#0a0e14]/95 backdrop-blur-md">
          <PitcherSearch />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/browse"
            className="group flex items-center justify-between gap-3 px-5 py-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 hover:border-white/30 text-white/90 hover:text-white shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex flex-col items-start min-w-0">
              <span className="text-sm font-medium">Browse by team</span>
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/45 group-hover:text-white/65">
                Pitchers · rosters
              </span>
            </div>
            {/* 2×2 grid affordance: hints at the team grid the link
                opens. Same circular-button pattern as the daily-pick
                cards so the action layer reads as one consistent
                system across the homepage. */}
            <div
              aria-hidden
              className="flex-shrink-0 w-10 h-10 rounded-full bg-white/[0.08] border border-white/15 flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:bg-white/[0.18] group-hover:border-white/30"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-[18px] h-[18px] fill-white/85 transition-colors group-hover:fill-white"
              >
                <rect x="4" y="4" width="7" height="7" rx="1.5" />
                <rect x="13" y="4" width="7" height="7" rx="1.5" />
                <rect x="4" y="13" width="7" height="7" rx="1.5" />
                <rect x="13" y="13" width="7" height="7" rx="1.5" />
              </svg>
            </div>
          </Link>
          <Link
            href="/at-bat"
            className="group flex items-center justify-between gap-3 px-5 py-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 hover:border-white/30 text-white/90 hover:text-white shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex flex-col items-start min-w-0">
              <span className="text-sm font-medium">At-bat replays</span>
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/45 group-hover:text-white/65">
                Pitch-by-pitch
              </span>
            </div>
            {/* Play triangle — matches the play button on the daily
                pick cards since both destinations are pitch replays. */}
            <div
              aria-hidden
              className="flex-shrink-0 w-10 h-10 rounded-full bg-white/[0.08] border border-white/15 flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:bg-white/[0.18] group-hover:border-white/30"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 fill-white/85 ml-[2px] transition-colors group-hover:fill-white"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </Link>
          <Link
            href="/explore"
            className="group flex items-center justify-between gap-3 px-5 py-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 hover:border-white/30 text-white/90 hover:text-white shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex flex-col items-start min-w-0">
              <span className="text-sm font-medium">Explore the dataset</span>
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/45 group-hover:text-white/65">
                Filters · stats
              </span>
            </div>
            {/* Sliders icon: two horizontal tracks + filled knobs.
                Reads as "adjust filters" — matches the subtitle. */}
            <div
              aria-hidden
              className="flex-shrink-0 w-10 h-10 rounded-full bg-white/[0.08] border border-white/15 flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:bg-white/[0.18] group-hover:border-white/30"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-[18px] h-[18px] fill-white/85 transition-colors group-hover:fill-white"
              >
                <rect x="3" y="6" width="11" height="2" rx="1" />
                <circle cx="17" cy="7" r="2.5" />
                <rect x="3" y="16" width="7" height="2" rx="1" />
                <circle cx="13" cy="17" r="2.5" />
              </svg>
            </div>
          </Link>
        </div>

        {/* Each strip streams in independently via Suspense — Next.js
            sends the rest of the page first, then patches each strip
            in when its Supabase query resolves. */}
        <Suspense fallback={<StripFallback title="Today" rows={2} />}>
          <DailyPickStrip />
        </Suspense>

        <Suspense
          fallback={<StripFallback title="Yesterday's games" rows={5} grid />}
        >
          <YesterdayGamesStrip />
        </Suspense>

        <Suspense fallback={<StripFallback title="Leaders" rows={6} grid />}>
          <RankingsStrip />
        </Suspense>

        <Suspense fallback={<StripFallback title="Featured" rows={6} grid />}>
          <FeaturedStrip />
        </Suspense>
      </div>
    </main>
  );
}
