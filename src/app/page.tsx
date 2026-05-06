import Image from "next/image";
import Link from "next/link";
import { PitcherSearch } from "@/components/search/PitcherSearch";
import { FeaturedStrip } from "@/components/home/FeaturedStrip";
import { DailyPickStrip } from "@/components/home/DailyPickStrip";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90">
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-3 text-center">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">
            Phase 4 · At-bat replays
          </div>
          <h1 className="inline-flex items-center justify-center gap-4">
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
              width={195}
              height={60}
              className="h-15 w-auto"
              priority
              style={{ height: "3.75rem" }}
            />
          </h1>
          <p className="text-sm text-white/55 leading-relaxed">
            MLB pitch trajectories in 3D. Search a pitcher, browse by team, or
            replay any at-bat pitch-by-pitch.
          </p>
        </header>

        <PitcherSearch autoFocus />

        <div className="flex justify-center gap-4">
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
        </div>

        <DailyPickStrip />

        <FeaturedStrip />

        <div className="text-center pt-8">
          <Link
            href="/dev/single-pitch"
            className="text-[11px] uppercase tracking-[0.16em] text-white/35 hover:text-white/70 transition-colors"
          >
            Open the dev pitch viewer
          </Link>
        </div>
      </div>
    </main>
  );
}
