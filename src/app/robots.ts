import type { MetadataRoute } from "next";

// Lets crawlers index everything except internal API routes and
// OG-image endpoints (those serve binary blobs, not pages).
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchtracker.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
