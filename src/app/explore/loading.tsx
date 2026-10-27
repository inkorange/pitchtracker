// Renders while /explore resolves on the server. The explore data comes
// from the cached Savant search read-through, so a cold query waits on
// an upstream fetch.
export default function Loading() {
  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 pt-16 pb-12">
      <div className="max-w-5xl mx-auto px-6 space-y-6">
        <div className="h-7 w-48 bg-white/[0.08] rounded animate-pulse" />
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/55">
          <span className="inline-block w-2 h-2 rounded-full bg-white/40 animate-pulse" />
          Loading pitches…
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-lg bg-white/[0.04] border border-white/[0.07] animate-pulse"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
