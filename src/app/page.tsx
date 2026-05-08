import Image from "next/image";
import Link from "next/link";
import { PitcherSearch } from "@/components/search/PitcherSearch";
import { FeaturedStrip } from "@/components/home/FeaturedStrip";
import { DailyPickStrip } from "@/components/home/DailyPickStrip";
import { RankingsStrip } from "@/components/home/RankingsStrip";

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
              alt="pitchtracker"
              width={290}
              height={50}
              className="h-10 sm:h-20 w-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
              priority
            />
          </h1>
          <p className="text-sm text-white/95 leading-relaxed max-w-prose drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
            MLB pitch trajectories in 3D. Search a pitcher, browse by team, or
            replay any at-bat pitch-by-pitch.
          </p>
        </header>
      </section>

      <div className="max-w-3xl mx-auto px-6 pt-8 pb-16 space-y-10">
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
            <span
              aria-hidden
              className="text-white/55 group-hover:text-white group-hover:translate-x-0.5 transition-all"
            >
              →
            </span>
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
            <span
              aria-hidden
              className="text-white/55 group-hover:text-white group-hover:translate-x-0.5 transition-all"
            >
              →
            </span>
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
            <span
              aria-hidden
              className="text-white/55 group-hover:text-white group-hover:translate-x-0.5 transition-all"
            >
              →
            </span>
          </Link>
        </div>

        <DailyPickStrip />

        <RankingsStrip />

        <FeaturedStrip />
      </div>
    </main>
  );
}
