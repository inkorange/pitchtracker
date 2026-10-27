// Renders while /velocity_leaders resolves on the server.
//
// This is the heaviest cold fetch on the site: the 7-day velocity
// board aggregates a league-wide Savant query (~9 MB, ~13,000 rows for a
// measured in-season week) before it can rank anything. Warm it is a
// cached handful of rows; cold it is a real wait.
//
// Mirrors the 1080x1350 screenshot frame the page renders into so the
// skeleton doesn't shift the layout when real rows arrive.
export default function Loading() {
  return (
    <main className="min-h-screen w-full bg-[#040a14] flex items-center justify-center">
      <div className="w-[1080px] h-[1350px] flex flex-col bg-gradient-to-b from-[#0a1226] via-[#0a1428] to-[#040a14] text-white relative overflow-hidden font-sans">
        <header className="relative z-10 px-12 pt-12 pb-6 space-y-3">
          <div className="h-10 w-[560px] bg-white/[0.08] rounded animate-pulse" />
          <div className="h-5 w-[320px] bg-white/[0.06] rounded animate-pulse" />
        </header>
        <div className="relative z-10 px-12 flex items-center gap-3 text-[20px] uppercase tracking-[0.16em] text-white/55">
          <span className="inline-block w-3 h-3 rounded-full bg-white/40 animate-pulse" />
          Loading velocity leaders…
        </div>
        <ol className="relative z-10 flex-1 px-12 py-4 flex flex-col gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.07]"
            >
              <div className="w-10 h-10 rounded-full bg-white/[0.08] animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-64 bg-white/[0.08] rounded animate-pulse" />
                <div className="h-4 w-32 bg-white/[0.06] rounded animate-pulse" />
              </div>
              <div className="h-8 w-24 bg-white/[0.07] rounded animate-pulse" />
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
