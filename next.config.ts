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
    ];
  },
};

export default nextConfig;
