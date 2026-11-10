import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveDisplaySeason } from "@/lib/season/current-season";
import type { Database } from "@/lib/supabase/types";

// Cross-request caches for the Supabase reads behind /pitcher/[id]/[slug].
//
// WHY THIS EXISTS (2026-11-10)
//
// The pitcher page reads searchParams, and every filter combination
// (?pitch=, ?event=, ?veloMin=, ?hand=, ?game=, ...) is its own
// self-canonical URL. The CDN profile in next.config.ts caches per
// URL, so a crawler sweeping filter permalinks gets a cold render on
// almost every request. Each cold render was making ~8 PostgREST calls
// (pitcher row x2, max(season) x2, team rows x2, arsenal aggregates),
// none of which depend on the filters.
//
// On 2026-11-08 16:00-17:00 UTC that pattern produced ~52k requests to
// pitch_teams / pitch_pitchers / pitch_pitcher_aggregates in one hour
// (normal is ~400/hr), all server-side (UA "node"), with no deploy and
// no cron behind it. Because pitchtracker shares the Portfolio
// Supabase project with TerraForge, portfolio and affiliates, the
// burst slowed every app's functions and inflated Fluid provisioned
// memory team-wide.
//
// Caching these reads per pitcher (not per URL) means a sweep of N
// filter URLs for one pitcher costs the database one read per TTL
// instead of ~8N. The data is effectively static: rosters and
// metadata refresh once a day via cron, and the offseason freezes
// aggregates entirely.

const PITCHER_REVALIDATE_S = 60 * 60; // 1h — metadata crons run daily
const TEAMS_REVALIDATE_S = 60 * 60 * 24; // 24h — 30 rows, near-static
const SEASON_REVALIDATE_S = 60 * 60; // 1h — changes once a year

export type PitcherRow = Database["public"]["Tables"]["pitch_pitchers"]["Row"];
export type TeamSummary = Pick<
  Database["public"]["Tables"]["pitch_teams"]["Row"],
  "mlb_id" | "name" | "abbreviation"
>;
export type ArsenalSummaryRow = Pick<
  Database["public"]["Tables"]["pitch_pitcher_aggregates"]["Row"],
  "pitch_type" | "pitch_count" | "avg_velocity"
>;

/** Full pitch_pitchers row for one pitcher, or null if unknown. */
export const getCachedPitcher = unstable_cache(
  async (pitcherId: number): Promise<PitcherRow | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pitch_pitchers")
      .select("*")
      .eq("mlb_id", pitcherId)
      .maybeSingle();
    // Throw on error so a transient failure isn't cached as "not found"
    // (which would 404 the pitcher for an hour).
    if (error) throw error;
    return data;
  },
  ["pitcher-row"],
  { revalidate: PITCHER_REVALIDATE_S, tags: ["pitch-pitchers"] },
);

/**
 * All teams as [mlb_id, summary] pairs. Fetching the whole 30-row
 * table once is cheaper than any per-render `.eq` / `.in` lookup.
 */
const cachedTeamEntries = unstable_cache(
  async (): Promise<Array<[number, TeamSummary]>> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pitch_teams")
      .select("mlb_id, name, abbreviation");
    if (error) throw error;
    return (data ?? []).map((t) => [t.mlb_id, t]);
  },
  ["pitch-teams-all"],
  { revalidate: TEAMS_REVALIDATE_S, tags: ["pitch-teams"] },
);

/** Team lookup map keyed by MLB team id. */
export async function getCachedTeamMap(): Promise<Map<number, TeamSummary>> {
  return new Map(await cachedTeamEntries());
}

/** {@link resolveDisplaySeason}, shared across requests. */
export const getCachedDisplaySeason = unstable_cache(
  async (): Promise<number> => {
    const supabase = await createClient();
    return resolveDisplaySeason(supabase);
  },
  ["display-season"],
  { revalidate: SEASON_REVALIDATE_S, tags: ["pitch-season"] },
);

/** Top-4 pitch types by usage for the SERP arsenal phrase. */
export const getCachedTopArsenal = unstable_cache(
  async (pitcherId: number, season: number): Promise<ArsenalSummaryRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pitch_pitcher_aggregates")
      .select("pitch_type, pitch_count, avg_velocity")
      .eq("pitcher_id", pitcherId)
      .eq("season", season)
      .eq("batter_hand", "*")
      .order("pitch_count", { ascending: false })
      .limit(4);
    if (error) throw error;
    return data ?? [];
  },
  ["pitcher-top-arsenal"],
  { revalidate: PITCHER_REVALIDATE_S, tags: ["pitch-aggregates"] },
);
