// Renders while /at-bat/[gamePk] resolves on the server.
//
// The at-bat list is now built from a cached Savant read rather than a
// Postgres query, so a cold game (nothing in the data cache yet) waits
// on an upstream CSV fetch. That is fast once warm and invisible on a
// cache hit, but worth a skeleton rather than a blank screen on the
// first visit.
//
// The [gamePk] layout owns the <main> wrapper, so this paints content
// only — same composition rule as the [atBatNumber] loader.
export default function Loading() {
  return (
    <div className="text-white/90 px-6 pt-20 pb-12">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Game header: team logos + matchup line */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/[0.08] animate-pulse" />
            <div className="h-6 w-56 bg-white/[0.08] rounded animate-pulse" />
            <div className="w-9 h-9 rounded-full bg-white/[0.08] animate-pulse" />
          </div>
          <div className="h-3 w-40 bg-white/[0.06] rounded animate-pulse" />
        </div>

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/55">
          <span className="inline-block w-2 h-2 rounded-full bg-white/40 animate-pulse" />
          Loading at-bats…
        </div>

        {/* At-bat rows */}
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.04] border border-white/[0.07]"
            >
              <div className="w-8 h-8 rounded-full bg-white/[0.08] animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-48 bg-white/[0.08] rounded animate-pulse" />
                <div className="h-3 w-28 bg-white/[0.06] rounded animate-pulse" />
              </div>
              <div className="h-5 w-16 bg-white/[0.06] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
