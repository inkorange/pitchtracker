import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { atBatSlug, slugifyPitcherName } from "@/lib/url/pitcher-slug";

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
        .select("mlb_id, full_name, updated_at")
        .gte("last_active_year", season),
      supabase.from("pitch_teams").select("mlb_id, updated_at"),
      supabase
        .from("pitch_notable_at_bats")
        .select(
          "game_pk, at_bat_number, pitcher_id, batter_id, game_date, computed_at",
        )
        .order("game_date", { ascending: false })
        .limit(100),
    ]);
    // Emit the canonical slugged URL `/pitcher/{id}/{slug}` rather
    // than the id-only form — the id-only path 308-redirects, but
    // Google should learn the destination directly from the sitemap
    // so the redirect is a cold-link fallback instead of the steady
    // state.
    const pitcherBase = (pitchersRes.data ?? []).map((p) => ({
      url: `${SITE_URL}/pitcher/${p.mlb_id}/${slugifyPitcherName(p.full_name)}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
    const pitcherVariants = (pitchersRes.data ?? []).flatMap((p) => {
      const base = `${SITE_URL}/pitcher/${p.mlb_id}/${slugifyPitcherName(p.full_name)}`;
      return PITCHER_FILTER_VARIANTS.map((v) => ({
        url: `${base}${v.query}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : now,
        changeFrequency: "daily" as const,
        priority: v.priority,
      }));
    });
    pitcherEntries = [...pitcherBase, ...pitcherVariants];
    teamEntries = (teamsRes.data ?? []).map((t) => ({
      url: `${SITE_URL}/browse/${t.mlb_id}`,
      lastModified: t.updated_at ? new Date(t.updated_at) : now,
      changeFrequency: "weekly",
      priority: 0.5,
    }));
    // Batch-resolve pitcher and batter names so notable-AB entries
    // can emit slugged URLs (`/at-bat/{gamePk}/{atBatNumber}/{pitcher-slug}-vs-{batter-slug}`)
    // rather than the id-only form. Two extra queries per build —
    // cheap compared to the 100-AB iteration that would otherwise hit
    // pitch_game_pitches once per AB.
    const notableRows = notableRes.data ?? [];
    const notablePitcherIds = Array.from(
      new Set(
        notableRows
          .map((n) => n.pitcher_id)
          .filter((id): id is number => id != null),
      ),
    );
    const notableBatterIds = Array.from(
      new Set(
        notableRows
          .map((n) => n.batter_id)
          .filter((id): id is number => id != null),
      ),
    );
    const [notablePitcherRes, notableBatterRes] = await Promise.all([
      notablePitcherIds.length > 0
        ? supabase
            .from("pitch_pitchers")
            .select("mlb_id, full_name")
            .in("mlb_id", notablePitcherIds)
        : Promise.resolve({ data: [] }),
      notableBatterIds.length > 0
        ? supabase
            .from("pitch_batters")
            .select("mlb_id, full_name")
            .in("mlb_id", notableBatterIds)
        : Promise.resolve({ data: [] }),
    ]);
    const notablePitcherNameById = new Map(
      (notablePitcherRes.data ?? []).map((p) => [p.mlb_id, p.full_name]),
    );
    const notableBatterNameById = new Map(
      (notableBatterRes.data ?? []).map((b) => [b.mlb_id, b.full_name]),
    );
    notableEntries = notableRows.map((n) => {
      const pitcherName =
        n.pitcher_id != null
          ? notablePitcherNameById.get(n.pitcher_id) ?? null
          : null;
      const batterName =
        n.batter_id != null
          ? notableBatterNameById.get(n.batter_id) ?? null
          : null;
      const slugTail = pitcherName
        ? `/${atBatSlug(pitcherName, batterName)}`
        : "";
      return {
        url: `${SITE_URL}/at-bat/${n.game_pk}/${n.at_bat_number}${slugTail}`,
        lastModified: n.computed_at ? new Date(n.computed_at) : now,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      };
    });
  } catch {
    // Sitemap build should never break the deploy — if Supabase is
    // unreachable, ship the static entries alone.
  }

  return [...staticEntries, ...pitcherEntries, ...teamEntries, ...notableEntries];
}
