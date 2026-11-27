import { ScrollToTop } from "@/components/chrome/ScrollToTop";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { Spinner } from "@/components/feedback/Spinner";

// Renders while /explore resolves on the server.
export default function Loading() {
  return (
    <main className="min-h-screen bg-bg text-ink" aria-busy="true">
      <ScrollToTop />
      <SiteHeader active="explore" />
      <div className="container-page pt-12 flex flex-col gap-5">
        <div className="h-16 w-80 rounded bg-surface motion-safe:animate-pulse" />
        <div className="h-14 rounded-control bg-surface border border-line motion-safe:animate-pulse" />
        <div className="flex items-center gap-3 text-muted">
          <Spinner /> Loading…
        </div>
      </div>
    </main>
  );
}
