import Image from "next/image";
import Link from "next/link";
import { PitcherSearch } from "@/components/search/PitcherSearch";
import { FeaturedStrip } from "@/components/home/FeaturedStrip";
import { DailyPickStrip } from "@/components/home/DailyPickStrip";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90">
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">
        <header className="space-y-8 text-center">
          <h1 className="flex items-center justify-center gap-4">
            <Image
              src="/Major_League_Baseball_logo.svg"
              alt=""
              width={75}
              height={40}
              className="h-10 w-auto"
              priority
            />
            <Image
              src="/pitchtracker-logo.svg"
              alt="pitchtracker"
              width={290}
              height={50}
              className="h-10 sm:h-24 w-auto"
              priority
            />
          </h1>
          <p className="text-sm text-white/55 leading-relaxed">
            MLB pitch trajectories in 3D. Search a pitcher, browse by team, or
            replay any at-bat pitch-by-pitch.
          </p>
        </header>

        {/* Sticky so the search stays reachable as the user scrolls
            through the daily pick + featured strips. -mx-6 px-6
            extends the backdrop to the container edges so scrolled
            content underneath doesn't bleed through. */}
        <div className="sticky top-2 z-20 -mx-6 px-6 py-3 bg-[#0a0e14]/95 backdrop-blur-md">
          <PitcherSearch />
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/browse"
            className="text-[11px] uppercase tracking-[0.16em] text-white/55 hover:text-white transition-colors"
          >
            Browse by team →
          </Link>
          <Link
            href="/at-bat"
            className="text-[11px] uppercase tracking-[0.16em] text-white/55 hover:text-white transition-colors"
          >
            At-bat replays →
          </Link>
          <Link
            href="/explore"
            className="text-[11px] uppercase tracking-[0.16em] text-white/55 hover:text-white transition-colors"
          >
            Explore the dataset →
          </Link>
        </div>

        <DailyPickStrip />

        <FeaturedStrip />
      </div>
    </main>
  );
}
