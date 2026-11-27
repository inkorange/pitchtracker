import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { getCachedDisplaySeason } from "@/lib/pitcher/cached-reads";
import { absoluteUrl } from "@/lib/url/site";
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
    title: "Explore · PitchTracker",
    description:
      "Mine the Statcast pitch dataset by handedness, count, outcome, pitch type, season, and more.",
    alternates: { canonical: "/explore" },
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

// Dataset schema for /explore. Helps Google Dataset Search index the
// underlying Statcast pitch corpus this page surfaces. Generic "every
// pitch thrown in MLB games we've cached" — individual filtered views
// share the same dataset, so no need to vary it per query.
const datasetJsonLd = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "MLB Statcast pitch trajectories",
  description:
    "Per-pitch Statcast measurements (release point, velocity, acceleration, spin, plate location) for every cached MLB game. Filterable by pitcher, batter, pitch type, count, outs, inning, game type, batter handedness, pitch description, at-bat event, batted-ball type, and strike-zone code.",
  keywords: [
    "MLB",
    "Statcast",
    "pitch tracking",
    "baseball analytics",
    "pitch trajectories",
  ],
  creator: {
    "@type": "Organization",
    name: "Major League Baseball",
    url: "https://baseballsavant.mlb.com",
  },
  isAccessibleForFree: true,
  license: "https://baseballsavant.mlb.com/",
  url: absoluteUrl("/explore"),
};

// Explore — design/Explore.dc.html. Seasons offered: the display season
// and the five before it (Statcast search covers them all).
export default async function ExplorePage() {
  const display = await getCachedDisplaySeason();
  const seasons = Array.from({ length: 6 }, (_, i) => display - i);
  return (
    <main className="min-h-screen bg-bg text-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }}
      />
      <SiteHeader active="explore" />
      {/* nuqs reads search params on the client → needs a Suspense boundary. */}
      <Suspense fallback={<div className="container-page py-12 text-muted">Loading…</div>}>
        <ExploreClient seasons={seasons} />
      </Suspense>
    </main>
  );
}
