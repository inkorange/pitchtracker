import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { resolveDisplaySeason } from "@/lib/season/current-season";
import {
  fetchStrikeoutLeaders,
  fetchVelocityLeaders,
} from "@/lib/leaderboards/external";
import { pitcherHeadshotUrl } from "@/lib/viz/headshot";
import { TeamLogo } from "@/components/team/TeamLogo";
import { pitcherPagePath } from "@/lib/url/pitcher-slug";
import { SectionHeader } from "./SectionHeader";

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
// The redesign shows six cards (3×2 desktop, four on mobile): four
// stable elite arms plus two trending.
const ELITE_COUNT = 4;
const TRENDING_COUNT = 2;
// Offseason the trending feeds go quiet; backfill from further down
// the K leaderboard so the grid stays full.
const TOTAL_COUNT = ELITE_COUNT + TRENDING_COUNT;
const FEATURE_LOOKBACK_DAYS = 14;
const VELO_LOOKBACK_DAYS = 7;
const VELO_POOL_SIZE = 12; // pull more velo leaders than slots so dedup vs elite still leaves us enough

async function getFeaturedPitcherIds(
  supabase: SupabaseClient<Database>,
): Promise<{ ids: number[]; strikeoutsById: Map<number, number> }> {
  // The season we hold data for, not the calendar year — this strip
  // reads season-scoped RPCs and would go quiet every January.
  const season = await resolveDisplaySeason(supabase);

  // Track 1 — elite. Top season K leaders, stable week-over-week.
  // Calls the same RPC the /strikeout_leaders page uses, so the strip
  // and the leaderboard agree on who the top arms are.
  const kRows = await fetchStrikeoutLeaders({
    season,
    limit: TOTAL_COUNT,
  });
  const elite: number[] = kRows.slice(0, ELITE_COUNT).map((r) => r.pitcher_id);

  // Track 2 — trending. Two feeds, in priority order:
  //   2a. Pitchers featured in POTD or WoW in the last 14 days (highest
  //       signal — they actually won a daily feature recently).
  //   2b. Top fastball-velocity arms over the last 7 days (lighter
  //       signal, but surfaces flame-throwing relievers who don't show
  //       up in the K leaderboard).
  const cutoffIso = new Date(Date.now() - FEATURE_LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [{ data: featureRows }, veloRows] = await Promise.all([
    supabase
      .from("pitch_daily_features")
      .select("pitcher_id, feature_date")
      .gte("feature_date", cutoffIso)
      .order("feature_date", { ascending: false }),
    fetchVelocityLeaders({
      season,
      days: VELO_LOOKBACK_DAYS,
      limit: VELO_POOL_SIZE,
      minPitches: 20,
    }),
  ]);

  const trendingFeed: number[] = [];
  for (const r of featureRows ?? []) {
    if (r.pitcher_id != null) trendingFeed.push(r.pitcher_id);
  }
  for (const r of veloRows) {
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

  const ids = [...elite, ...trending];
  for (const r of kRows.slice(ELITE_COUNT)) {
    if (ids.length >= TOTAL_COUNT) break;
    if (!ids.includes(r.pitcher_id)) ids.push(r.pitcher_id);
  }

  return {
    ids,
    strikeoutsById: new Map(kRows.map((r) => [r.pitcher_id, r.strikeouts])),
  };
}

export async function FeaturedStrip() {
  const supabase = await createClient();
  const { ids, strikeoutsById } = await getFeaturedPitcherIds(supabase);
  if (ids.length === 0) return null;

  const { data: pitchers } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id, full_name, throws, current_team_id")
    .in("mlb_id", ids);

  if (!pitchers || pitchers.length === 0) return null;

  // Preserve the elite-then-trending order. A missing row (e.g. a
  // just-traded player not in pitch_pitchers yet) drops that slot.
  const ordered = ids
    .map((id) => pitchers.find((p) => p.mlb_id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <section aria-labelledby="featured-h" className="container-page pt-4 pb-14 md:pt-14 md:pb-24">
      <SectionHeader
        id="featured-h"
        title="Featured pitchers"
        aside={
          <Link
            href="/browse"
            className="text-sm font-semibold min-h-11 flex items-center text-ink hover:text-accent-hover"
          >
            <span className="md:hidden">Teams →</span>
            <span className="hidden md:inline">Browse by team →</span>
          </Link>
        }
      />
      <ul className="list-none m-0 p-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-3">
        {ordered.map((p, i) => {
          const k = strikeoutsById.get(p.mlb_id);
          const meta = [p.throws ? `${p.throws}HP` : null, k != null ? `${k} K` : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={p.mlb_id} className={i >= 4 ? "max-md:hidden" : undefined}>
              <Link
                href={pitcherPagePath(p.mlb_id, p.full_name)}
                className="flex items-center gap-3.5 px-4 py-3 md:px-[18px] md:py-3.5 bg-surface border border-line rounded-control text-ink hover:text-ink hover:border-line-strong transition-colors"
              >
                <span className="relative size-11 md:size-12 shrink-0 rounded-full bg-avatar overflow-hidden">
                  <Image
                    src={pitcherHeadshotUrl(p.mlb_id, 96)}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                    unoptimized
                  />
                </span>
                <span className="flex flex-col grow min-w-0">
                  <span className="font-display font-bold text-[21px] md:text-[22px] leading-[1.1] truncate">
                    {p.full_name}
                  </span>
                  {meta ? <span className="text-[13px] text-muted num">{meta}</span> : null}
                </span>
                {p.current_team_id ? <TeamLogo teamId={p.current_team_id} size={32} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
