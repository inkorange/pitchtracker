import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugifyPitcherName } from "@/lib/url/pitcher-slug";

// Id-only pitcher URL `/pitcher/{id}`. The canonical URL is the
// slugged form `/pitcher/{id}/{name-slug}` (better for "<Name> pitch
// tracking" searches). This route is kept alive only to 308-redirect
// any legacy/share links to the canonical form. The real page logic
// lives in `[id]/[slug]/page.tsx`.

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
  const pitcherId = Number(id);
  if (!Number.isFinite(pitcherId)) notFound();

  const supabase = await createClient();
  const { data: pitcher } = await supabase
    .from("pitch_pitchers")
    .select("full_name")
    .eq("mlb_id", pitcherId)
    .maybeSingle();
  if (!pitcher) notFound();

  const slug = slugifyPitcherName(pitcher.full_name);

  // Preserve search params on the redirect so deep links
  // (?season=&event=…&vsBatter=…) survive the canonical-URL hop.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v.length > 0) qs.set(k, v);
  }
  const tail = qs.toString();
  permanentRedirect(`/pitcher/${pitcherId}/${slug}${tail ? `?${tail}` : ""}`);
}
