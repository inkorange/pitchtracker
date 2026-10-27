// Renders while /compare resolves on the server.
//
// Compare is the slowest page to warm: it loads TWO pitcher-seasons,
// each a cached Savant read, so a cold pair waits on two upstream CSV
// fetches before anything renders. It has no layout of its own, so this
// owns the <main> wrapper and mirrors the page's two-column shell.
export default function Loading() {
  return (
    <main className="fixed inset-0 bg-[#0a0e14] overflow-hidden">
      <div className="absolute top-6 left-3 right-3 sm:left-6 sm:right-6 flex items-center justify-between gap-3">
        <div className="h-5 w-32 bg-white/[0.08] rounded animate-pulse" />
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/55">
          <span className="inline-block w-2 h-2 rounded-full bg-white/40 animate-pulse" />
          Loading both pitchers…
        </div>
      </div>

      {/* Two side panels, matching the compare layout */}
      <div className="absolute top-20 bottom-6 left-3 right-3 sm:left-6 sm:right-6 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
        {[0, 1].map((side) => (
          <div
            key={side}
            className="rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg p-4 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-white/[0.08] animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-36 bg-white/[0.08] rounded animate-pulse" />
                <div className="h-3 w-24 bg-white/[0.06] rounded animate-pulse" />
              </div>
            </div>
            {/* Arsenal rows */}
            <div className="space-y-2 pt-2 border-t border-white/[0.05]">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/[0.10] animate-pulse" />
                  <div className="h-3 w-24 bg-white/[0.07] rounded animate-pulse" />
                  <div className="h-3 w-14 bg-white/[0.05] rounded animate-pulse ml-auto" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
