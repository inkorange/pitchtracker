import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      // MLB headshot CDN
      { protocol: "https", hostname: "img.mlbstatic.com" },
      // MLB team logo CDN
      { protocol: "https", hostname: "www.mlbstatic.com" },
    ],
  },
  async headers() {
    // Vercel CDN cache profile for the public read-only routes (pitcher
    // detail, at-bat replay, browse, daily, etc.). `s-maxage=300` keeps
    // the rendered HTML fresh for 5 minutes; `stale-while-revalidate`
    // serves the stale copy instantly for the next 24 hours while a
    // background regen runs. Pitch data updates daily via the
    // refresh-aggregates cron, so 24h SWR aligns with the data cadence.
    //
    // Each unique URL — including search-param permutations like
    // `?event=strikeout&veloMin=96` — is a distinct cache key, so
    // filter permalinks cache independently of the unfiltered URL.
    //
    // This is the lever that lifts Google's per-site crawl ceiling:
    // cold serverless renders at ~1s TTFB throttle the crawl rate;
    // CDN HITs at ~20-50ms unlock it. Paired with the cookieless
    // Supabase server client (see src/lib/supabase/server.ts) so
    // Next.js doesn't mark the routes as dynamic and skip caching.
    const PUBLIC_PAGE_CACHE =
      "public, s-maxage=300, stale-while-revalidate=86400";

    return [
      {
        // Long-lived immutable cache for 3D model assets. These are
        // multi-MB binaries that don't change between deploys, so
        // letting the browser hold them for a year saves a download
        // on every subsequent page load. Vercel's edge will also
        // honor these headers and serve from its own cache.
        //
        // To swap a model, version the filename (e.g. batter.v2.glb)
        // and update BATTER_MODEL_URL in BatterSilhouette.tsx.
        // Same-named replacements will appear stale to existing
        // visitors until they hard-refresh — `immutable` tells the
        // browser it never has to revalidate.
        source: "/models/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: PUBLIC_PAGE_CACHE }],
      },
      {
        source: "/pitcher/:path*",
        headers: [{ key: "Cache-Control", value: PUBLIC_PAGE_CACHE }],
      },
      {
        // At-bat pages get a longer CDN cache than the shared
        // PUBLIC_PAGE_CACHE profile: a single at-bat's pitch data is
        // frozen the moment the game ends, so 1h s-maxage is safe and
        // absorbs the bot-enumeration traffic that was showing up in
        // pg_stat_statements. Combined with the pages' own ISR
        // revalidate=3600 the DB only pays once per URL per hour per
        // edge region.
        source: "/at-bat/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/browse/:path*",
        headers: [{ key: "Cache-Control", value: PUBLIC_PAGE_CACHE }],
      },
      {
        source: "/daily",
        headers: [{ key: "Cache-Control", value: PUBLIC_PAGE_CACHE }],
      },
      {
        source: "/explore",
        headers: [{ key: "Cache-Control", value: PUBLIC_PAGE_CACHE }],
      },
      {
        source: "/ai",
        headers: [{ key: "Cache-Control", value: PUBLIC_PAGE_CACHE }],
      },
      // Screenshot-target leaderboard pages. Rankings only refresh once
      // per day via the refresh-rankings cron, so a longer s-maxage is
      // fine and the X.com scheduler skill won't trigger a cold render
      // on every weekly capture.
      {
        source: "/strikeout_leaders",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/velocity_leaders",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
