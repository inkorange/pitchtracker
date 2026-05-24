import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

// Next.js builds this at request time and serves it at /sitemap.xml.
// Anchors:
//   - core surfaces (home, browse, daily, explore, at-bat index, /ai)
//   - one URL per active pitcher (last_active_year >= current)
//   - high-value filter permalinks per pitcher (strikeouts, HRs,
//     tunneling — the "landing-worthy" views the AI tool also produces)
//   - one URL per team
//   - up to 100 most recent notable-at-bat permalinks from
//     pitch_daily_features (curated daily highlights, stable URLs)
// We still skip the long tail of deep at-bat permalinks — ~100K per
// season is too noisy for the index to weight effectively.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchtracker.app";

// Pitcher-page filter variants worth surfacing per pitcher. Each is a
// concrete view ("his strikeouts", "his home runs given up", "his
// arsenal with tunneling shown") that maps cleanly to a search intent.
// Five entries × ~1500 pitchers = ~7500 URLs, well under Google's
// 50K/sitemap cap.
const PITCHER_FILTER_VARIANTS: Array<{ query: string; priority: number }> = [
  { query: "?event=strikeout", priority: 0.6 },
  { query: "?event=home_run", priority: 0.6 },
  { query: "?event=walk", priority: 0.5 },
  { query: "?tun=true", priority: 0.55 },
  { query: "?view=stats", priority: 0.55 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const season = now.getFullYear();
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/browse`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/daily`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/ai`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/explore`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/at-bat`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/compare`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
  ];

  let pitcherEntries: MetadataRoute.Sitemap = [];
  let teamEntries: MetadataRoute.Sitemap = [];
  let notableEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createClient();
    const [pitchersRes, teamsRes, notableRes] = await Promise.all([
      supabase
        .from("pitch_pitchers")
        .select("mlb_id, updated_at")
        .gte("last_active_year", season),
      supabase.from("pitch_teams").select("mlb_id, updated_at"),
      supabase
        .from("pitch_notable_at_bats")
        .select("game_pk, at_bat_number, game_date, computed_at")
        .order("game_date", { ascending: false })
        .limit(100),
    ]);
    const pitcherBase = (pitchersRes.data ?? []).map((p) => ({
      url: `${SITE_URL}/pitcher/${p.mlb_id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
    const pitcherVariants = (pitchersRes.data ?? []).flatMap((p) =>
      PITCHER_FILTER_VARIANTS.map((v) => ({
        url: `${SITE_URL}/pitcher/${p.mlb_id}${v.query}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : now,
        changeFrequency: "daily" as const,
        priority: v.priority,
      })),
    );
    pitcherEntries = [...pitcherBase, ...pitcherVariants];
    teamEntries = (teamsRes.data ?? []).map((t) => ({
      url: `${SITE_URL}/browse/${t.mlb_id}`,
      lastModified: t.updated_at ? new Date(t.updated_at) : now,
      changeFrequency: "weekly",
      priority: 0.5,
    }));
    notableEntries = (notableRes.data ?? []).map((n) => ({
      url: `${SITE_URL}/at-bat/${n.game_pk}/${n.at_bat_number}`,
      lastModified: n.computed_at ? new Date(n.computed_at) : now,
      changeFrequency: "monthly",
      priority: 0.6,
    }));
  } catch {
    // Sitemap build should never break the deploy — if Supabase is
    // unreachable, ship the static entries alone.
  }

  return [...staticEntries, ...pitcherEntries, ...teamEntries, ...notableEntries];
}
