export default function Loading() {
  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 py-12">
      <div className="max-w-4xl mx-auto space-y-10">
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">
            ← All teams
          </div>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/[0.06] rounded animate-pulse" />
            <div className="space-y-2">
              <div className="h-6 w-48 bg-white/[0.08] rounded animate-pulse" />
              <div className="h-3 w-32 bg-white/[0.06] rounded animate-pulse" />
            </div>
          </div>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <li
              key={i}
              className="h-16 rounded-lg bg-white/[0.04] border border-white/[0.06] animate-pulse"
            />
          ))}
        </ul>
      </div>
    </main>
  );
}
