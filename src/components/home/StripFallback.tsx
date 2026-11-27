import { SectionHeader } from "./SectionHeader";

// Placeholder for homepage sections while their queries resolve.
// Same heading + roughly the same block heights so the page doesn't
// reflow when the real section streams in.
export function StripFallback({
  title,
  rows = 3,
  cols = 2,
  rowHeight = "h-[76px]",
}: {
  title?: string;
  rows?: number;
  cols?: 2 | 3;
  rowHeight?: string;
}) {
  return (
    <section className="container-page py-8 md:py-14" aria-busy="true">
      {title ? <SectionHeader title={title} /> : null}
      <div
        className={`grid grid-cols-1 gap-4 ${cols === 3 ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2"}`}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={`${rowHeight} rounded-control bg-surface border border-line motion-safe:animate-pulse`}
          />
        ))}
      </div>
    </section>
  );
}
