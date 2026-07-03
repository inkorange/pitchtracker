import { permanentRedirect } from "next/navigation";

// Id-only pitcher URL `/pitcher/{id}`. The canonical URL is the
// slugged form `/pitcher/{id}/{name-slug}` (better for "<Name> pitch
// tracking" searches). This route unconditionally 308-redirects to a
// placeholder-slug URL; the slugged route (`[id]/[slug]/page.tsx`)
// does its own Supabase lookup and either 308-redirects again to the
// CANONICAL slug or 404s if the id is bogus.
//
// Why no DB lookup here anymore: the previous version fetched the
// pitcher, computed the canonical slug, and redirected directly to
// it — but in production the Supabase lookup was returning null for
// valid pitcher IDs (Logan Gilbert, mlb_id 669302, etc.), triggering
// notFound() and rendering Next.js's 404 page as HTTP 200 in place
// of a redirect. That produced a Google Search Console
// "Duplicate without user-selected canonical" error: the same 404
// body was being served across every valid pitcher ID, creating a
// giant duplicate-content cluster none of which pointed at a
// canonical. Skipping the DB check entirely and letting the slugged
// route resolve the id → slug removes the single point of failure.

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PitcherIdRedirect({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  // Preserve search params on the redirect so deep links
  // (?season=&event=…&vsBatter=…) survive the canonical-URL hop.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v.length > 0) qs.set(k, v);
  }
  const tail = qs.toString();
  // Placeholder slug `p` — the slugged route's own slug-normalization
  // block (`if (slug !== canonicalSlug) permanentRedirect(...)`)
  // will 308 to the real canonical slug on the next hop. Two
  // redirects total for a legacy id-only link, but crawlers follow
  // 308 chains fine and the SITEMAP already emits the canonical
  // slug directly so the chain is a cold-link fallback, not the
  // steady state.
  permanentRedirect(`/pitcher/${id}/p${tail ? `?${tail}` : ""}`);
}
