// Shared SITE_URL + absoluteUrl() helper.
//
// JSON-LD structured data must ship ABSOLUTE URLs in any `url`/`item`/
// `@id` field — Google Search Console's structured-data validator
// reports relative paths as "Invalid URL". Until 2026-06-10 the
// breadcrumb + SportsEvent + SportsTeam + Dataset + SoftwareApplication
// JSON-LD blocks across the app emitted `/`, `/browse`, `/pitcher/{id}`
// etc. directly — fine for human navigation, invalid for structured
// data.
//
// metadataBase in the root layout already resolves relative paths for
// Next.js's <meta property="og:url"> + canonical, so this helper is
// only needed for hand-written JSON-LD blocks.

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchtracker.app";

/**
 * Prefix a site-relative path with SITE_URL so the result is a
 * valid absolute URL. Pass-throughs (already absolute, mailto:, etc.)
 * are returned untouched.
 */
export function absoluteUrl(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  const base = SITE_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
