import type { MetadataRoute } from "next";

// Crawl rules for the public site. Explicit disallows here save Google
// from wasting crawl budget on routes that don't produce ranking-
// worthy pages, which meaningfully speeds up how quickly the pitcher /
// at-bat sitemap URLs get processed. Rule of thumb: if the route
// returns JSON, an image, an OG card, or an internal-only harness,
// disallow it here.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchtracker.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // JSON APIs (routes/[...]/route.ts). Includes /api/og/*
          // which returns image blobs, not indexable HTML.
          "/api/",
          // Scratch harnesses under /dev — one-off model/preset test
          // pages that shouldn't appear in search. Layout in
          // src/app/dev/layout.tsx also sets `robots: noindex`; this
          // is the belt-and-suspenders.
          "/dev/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
