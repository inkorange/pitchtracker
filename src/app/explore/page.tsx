import type { Metadata } from "next";
import { Suspense } from "react";
import { TopNav } from "@/components/chrome/TopNav";
import { ExploreClient } from "./ExploreClient";

interface ExplorePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: ExplorePageProps): Promise<Metadata> {
  const sp = await searchParams;
  // Forward the same filter params to /api/og/explore so the share
  // card mirrors whatever the link recipient is about to see.
  const ogParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => ogParams.append(k, x));
    else if (typeof v === "string") ogParams.set(k, v);
  }
  const ogUrl = `/api/og/explore?${ogParams.toString()}`;
  return {
    title: "Explore · pitchtracker",
    description:
      "Mine the Statcast pitch dataset by handedness, count, outcome, pitch type, season, and more.",
    openGraph: {
      title: "Explore the Statcast pitch dataset",
      description:
        "Mine pitch trajectories by pitcher, handedness, count, outcome, season, and more.",
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: [ogUrl],
    },
  };
}

export default function ExplorePage() {
  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 pt-16 pb-12">
      <TopNav back={{ href: "/", label: "Home" }} title="Explore" />
      <Suspense fallback={<div className="px-6 py-8 text-white/55">Loading…</div>}>
        <ExploreClient />
      </Suspense>
    </main>
  );
}
