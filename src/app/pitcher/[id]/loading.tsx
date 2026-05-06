export default function Loading() {
  return (
    <main className="fixed inset-0 bg-[#0a0e14] text-white/90">
      <div className="absolute top-6 left-6 right-6 flex items-start justify-between gap-6">
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">
          ← pitchtracker
        </div>
      </div>
      <div className="absolute top-20 left-6 w-[340px] rounded-lg bg-black/50 backdrop-blur-md border border-white/10 shadow-lg p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-white/[0.08] animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 bg-white/[0.08] rounded animate-pulse" />
            <div className="h-3 w-20 bg-white/[0.06] rounded animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/55 pt-2">
          <span className="inline-block w-2 h-2 rounded-full bg-white/40 animate-pulse" />
          Loading pitcher…
        </div>
      </div>
    </main>
  );
}
