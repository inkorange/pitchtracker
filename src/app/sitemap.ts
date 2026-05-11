import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

// Next.js builds this at request time and serves it at /sitemap.xml.
// Anchors:
//   - core surfaces (home, browse, daily, explore, at-bat index)
//   - one URL per active pitcher (last_active_year >= current)
//   - one URL per team
// We skip the deep at-bat permalinks — there are ~100K per season
// and they're not yet stable rankable content. /pitcher/[id] and
// /browse/[teamId] are the highest-priority indexable pages.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchtracker.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const season = now.getFullYear();
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/browse`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/daily`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/explore`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/at-bat`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/compare`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
  ];

  let pitcherEntries: MetadataRoute.Sitemap = [];
  let teamEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createClient();
    const [pitchersRes, teamsRes] = await Promise.all([
      supabase
        .from("pitch_pitchers")
        .select("mlb_id, updated_at")
        .gte("last_active_year", season),
      supabase.from("pitch_teams").select("mlb_id, updated_at"),
    ]);
    pitcherEntries = (pitchersRes.data ?? []).map((p) => ({
      url: `${SITE_URL}/pitcher/${p.mlb_id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: "daily",
      priority: 0.7,
    }));
    teamEntries = (teamsRes.data ?? []).map((t) => ({
      url: `${SITE_URL}/browse/${t.mlb_id}`,
      lastModified: t.updated_at ? new Date(t.updated_at) : now,
      changeFrequency: "weekly",
      priority: 0.5,
    }));
  } catch {
    // Sitemap build should never break the deploy — if Supabase is
    // unreachable, ship the static entries alone.
  }

  return [...staticEntries, ...pitcherEntries, ...teamEntries];
}
