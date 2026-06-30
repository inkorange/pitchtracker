import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";
import { pitcherPagePath } from "@/lib/url/pitcher-slug";

// Two-track blend so the strip mixes stable elite names with a
// rotating "trending now" block:
//   - ELITE_COUNT slots: top season strikeout leaders (stable across
//     weeks). Anchors the strip with recognizable faces.
//   - TRENDING_COUNT slots: pitchers featured in POTD/WoW in the last
//     ~2 weeks first, then top recent fastball-velocity leaders to
//     fill any remaining slots. Both feeds are deduped against the
//     elite block. As the daily features rotate and reliever velo
//     surges happen, new names cycle through here without any code
//     changes.
//
// Page is edge-cached on a 5-min s-maxage so the recompute cost is
// amortized across viewers; the underlying data only changes when the
// daily cron runs, so the visible list shifts at most once per day.
const ELITE_COUNT = 6;
const TRENDING_COUNT = 6;
const FEATURE_LOOKBACK_DAYS = 14;
const VELO_LOOKBACK_DAYS = 7;
const VELO_POOL_SIZE = 12; // pull more velo leaders than slots so dedup vs elite still leaves us enough

async function getFeaturedPitcherIds(
  supabase: SupabaseClient<Database>,
): Promise<number[]> {
  const season = new Date().getFullYear();

  // Track 1 — elite. Top season K leaders, stable week-over-week.
  // Calls the same RPC the /strikeout_leaders page uses, so the strip
  // and the leaderboard agree on who the top arms are.
  const { data: kRows } = await supabase.rpc("pitch_top_strikeouts", {
    p_season: season,
    p_limit: ELITE_COUNT,
  });
  const elite: number[] = (kRows ?? []).map((r) => r.pitcher_id);

  // Track 2 — trending. Two feeds, in priority order:
  //   2a. Pitchers featured in POTD or WoW in the last 14 days (highest
  //       signal — they actually won a daily feature recently).
  //   2b. Top fastball-velocity arms over the last 7 days (lighter
  //       signal, but surfaces flame-throwing relievers who don't show
  //       up in the K leaderboard).
  const cutoffIso = new Date(Date.now() - FEATURE_LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [{ data: featureRows }, { data: veloRows }] = await Promise.all([
    supabase
      .from("pitch_daily_features")
      .select("pitcher_id, feature_date")
      .gte("feature_date", cutoffIso)
      .order("feature_date", { ascending: false }),
    supabase.rpc("pitch_top_velocity", {
      p_days: VELO_LOOKBACK_DAYS,
      p_limit: VELO_POOL_SIZE,
      p_min_pitches: 20,
    }),
  ]);

  const trendingFeed: number[] = [];
  for (const r of featureRows ?? []) {
    if (r.pitcher_id != null) trendingFeed.push(r.pitcher_id);
  }
  for (const r of veloRows ?? []) {
    trendingFeed.push(r.pitcher_id);
  }

  const eliteSet = new Set(elite);
  const seen = new Set<number>(elite);
  const trending: number[] = [];
  for (const id of trendingFeed) {
    if (eliteSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    trending.push(id);
    if (trending.length >= TRENDING_COUNT) break;
  }

  return [...elite, ...trending];
}

export async function FeaturedStrip() {
  const supabase = await createClient();
  const ids = await getFeaturedPitcherIds(supabase);
  if (ids.length === 0) return null;

  const { data: pitchers } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id, full_name, throws, current_team_id")
    .in("mlb_id", ids);

  if (!pitchers || pitchers.length === 0) return null;

  // Preserve the elite-then-trending order returned by the helper. A
  // missing pitcher_row (e.g. just-traded player not in pitch_pitchers
  // yet) just drops that slot — the grid auto-fills.
  const ordered = ids
    .map((id) => pitchers.find((p) => p.mlb_id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <section className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
        Featured pitchers
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {ordered.map((p) => (
          <li key={p.mlb_id}>
            <Link
              href={pitcherPagePath(p.mlb_id, p.full_name)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/15 transition-colors"
            >
              <div className="relative w-10 h-10 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
                <Image
                  src={pitcherHeadshotUrl(p.mlb_id, 80)}
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/95 truncate">{p.full_name}</div>
                <div className="text-[11px] text-white/45 tabular-nums">
                  {p.throws ? `${p.throws}HP` : ""}
                </div>
              </div>
              {p.current_team_id ? (
                <div className="relative w-7 h-7 flex-shrink-0">
                  <Image
                    src={teamLogoUrl(p.current_team_id)}
                    alt=""
                    fill
                    sizes="28px"
                    className="object-contain opacity-80"
                    unoptimized
                  />
                </div>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
