import { ScrollToTop } from "@/components/chrome/ScrollToTop";
import { SiteHeader } from "@/components/chrome/SiteHeader";

export default function Loading() {
  return (
    <main className="min-h-screen bg-bg text-ink" aria-busy="true">
      <ScrollToTop />
      <SiteHeader active="teams" />
      <div className="container-page pt-8 pb-16 flex flex-col gap-5">
        <div className="h-4 w-40 rounded bg-surface motion-safe:animate-pulse" />
        <div className="flex items-center gap-6">
          <div className="size-[88px] md:size-[152px] rounded-panel bg-surface motion-safe:animate-pulse" />
          <div className="flex flex-col gap-3">
            <div className="h-3 w-40 rounded bg-surface motion-safe:animate-pulse" />
            <div className="h-12 w-72 rounded bg-surface motion-safe:animate-pulse" />
          </div>
        </div>
        <div className="h-[72px] rounded-control bg-surface border border-line motion-safe:animate-pulse" />
        <ul className="list-none m-0 p-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <li key={i} className="h-[150px] rounded-control bg-surface border border-line motion-safe:animate-pulse" />
          ))}
        </ul>
      </div>
    </main>
  );
}
