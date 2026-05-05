import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-12">
      <div className="max-w-md text-center space-y-6">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">
          Phase 1 · Foundation
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">pitchtracker</h1>
        <p className="text-sm text-white/60 leading-relaxed">
          MLB pitch trajectories in 3D. The product surfaces aren&rsquo;t built yet — Phase 1 is
          retiring the visual-quality risk before we plug in real data.
        </p>
        <Link
          href="/dev/single-pitch"
          className="inline-block px-5 py-2.5 text-xs uppercase tracking-[0.16em] rounded-md bg-white/10 hover:bg-white/15 border border-white/10 text-white transition-colors"
        >
          Open the dev pitch viewer →
        </Link>
      </div>
    </main>
  );
}
