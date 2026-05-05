import Link from "next/link";
import { PitcherSearch } from "@/components/search/PitcherSearch";

export default function Home() {
  return (
    <main className="fixed inset-0 flex flex-col bg-[#0a0e14] text-white/90">
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md space-y-7 -mt-12">
          <div className="space-y-3 text-center">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">
              Phase 2 · Single pitcher view
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">pitchtracker</h1>
            <p className="text-sm text-white/55 leading-relaxed">
              MLB pitch trajectories in 3D. Search a pitcher to see their arsenal.
            </p>
          </div>
          <PitcherSearch autoFocus />
          <div className="text-center">
            <Link
              href="/dev/single-pitch"
              className="text-[11px] uppercase tracking-[0.16em] text-white/40 hover:text-white/70 transition-colors"
            >
              Open the dev pitch viewer →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
