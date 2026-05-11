// Shared placeholder for the homepage strips while their Supabase
// queries resolve. Renders the same section heading + a row of
// skeleton blocks so the page doesn't reflow when the real component
// streams in.
export function StripFallback({
  title,
  rows = 3,
  grid = false,
}: {
  title: string;
  rows?: number;
  grid?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-white/55">
          {title}
        </h2>
      </div>
      <div
        className={
          grid
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            : "grid grid-cols-1 sm:grid-cols-2 gap-3"
        }
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-16 rounded-lg bg-white/[0.04] border border-white/10 animate-pulse"
          />
        ))}
      </div>
    </section>
  );
}
