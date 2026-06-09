import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { pitcherHeadshotUrl } from "@/lib/viz/headshot";
import { pitcherPagePath } from "@/lib/url/pitcher-slug";
import { MetricInfo } from "./MetricInfo";

// Server-rendered Rankings strip — reads pitch_rankings (populated
// by /api/cron/refresh-rankings) for the active season and renders
// six cards, each listing the top 5 pitchers in one category.
//
// Categories ordered most-recognizable first: velo, strikeouts,
// whiff %, CSW %, spin, flat VAA.
//
// Renders nothing if the cron hasn't populated any rows yet (e.g.,
// preseason / fresh deploy with no data).

const CATEGORIES = [
  {
    key: "velo_ff",
    title: "Top Velocity",
    subtitle: "4-seam mph",
    unit: "mph",
    precision: 1,
    info: "Average 4-seam fastball velocity. Pure power — the radar-gun stat that's been the headline pitching metric for a century.",
  },
  {
    key: "strikeouts",
    title: "Most Strikeouts",
    subtitle: "season K count",
    unit: "K",
    precision: 0,
    info: "Total strikeouts on the season. Influenced by both swing-and-miss stuff and innings pitched.",
  },
  {
    key: "whiff_pct",
    title: "Top Whiff %",
    subtitle: "swings + misses",
    unit: "%",
    precision: 1,
    info: "Swinging-strike rate — the share of swings batters miss entirely. Measures how unhittable a pitcher's stuff is when hitters commit to swinging.",
  },
  {
    key: "csw_pct",
    title: "Top CSW %",
    subtitle: "called + swinging",
    unit: "%",
    precision: 1,
    info: "Called Strikes + Whiffs as a share of all pitches thrown. Captures both freezing batters with the slider and getting them to chase. One of the best single-pitch indicators of pitcher dominance.",
  },
  {
    key: "spin_ff",
    title: "Top Spin",
    subtitle: "4-seam rpm",
    unit: "rpm",
    precision: 0,
    info: "Average spin rate on the 4-seam fastball, in revolutions per minute. High spin keeps the ball up in the zone (resists gravity), which produces the perceived 'rising fastball' that drives swings under the ball.",
  },
  {
    key: "vaa_flat_ff",
    title: "Flattest VAA",
    subtitle: "4-seam approach°",
    unit: "°",
    precision: 2,
    info: "Vertical Approach Angle — the angle (from horizontal) at which the fastball crosses the plate. Flatter angles (closer to 0°) at the top of the zone are extremely hard to hit because the bat must square up a pitch coming in nearly level.",
  },
] as const;

interface RankingRow {
  category: string;
  rank: number;
  pitcher_id: number;
  value: number;
}

export async function RankingsStrip() {
  const supabase = await createClient();
  const season = new Date().getFullYear();
  const { data: rows } = await supabase
    .from("pitch_rankings")
    .select("category, rank, pitcher_id, value")
    .eq("season", season)
    .order("category")
    .order("rank");

  const rankings = (rows ?? []) as RankingRow[];
  if (rankings.length === 0) return null;

  // Resolve pitcher names in one round trip. Format as "S. Ohtani"
  // (first-initial + full last name) so the row width can fit names
  // like "Garrett Crochet" or "Yoshinobu Yamamoto" without
  // truncating the last name. Fall back to full_name when first /
  // last aren't populated.
  const pitcherIds = Array.from(new Set(rankings.map((r) => r.pitcher_id)));
  const { data: pitcherRows } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id, full_name, first_name, last_name")
    .in("mlb_id", pitcherIds);
  const nameById = new Map<number, string>(
    (pitcherRows ?? []).map((p) => [p.mlb_id, formatPitcherName(p)]),
  );
  // Slugged-URL map keyed by pitcher_id so each row links directly to
  // the canonical /pitcher/{id}/{slug} URL instead of taking a 308
  // hop through the id-only redirect.
  const hrefById = new Map<number, string>(
    (pitcherRows ?? []).map((p) => [p.mlb_id, pitcherPagePath(p.mlb_id, p.full_name)]),
  );

  // Group rows by category, preserve rank order.
  const byCategory = new Map<string, RankingRow[]>();
  for (const r of rankings) {
    const arr = byCategory.get(r.category) ?? [];
    arr.push(r);
    byCategory.set(r.category, arr);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-white/55">
          Leaders
        </h2>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
          {season} regular season
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CATEGORIES.map((cat) => {
          const items = byCategory.get(cat.key) ?? [];
          if (items.length === 0) return null;
          return (
            <RankingsCard
              key={cat.key}
              title={cat.title}
              subtitle={cat.subtitle}
              unit={cat.unit}
              precision={cat.precision}
              info={cat.info}
              items={items}
              nameById={nameById}
              hrefById={hrefById}
            />
          );
        })}
      </div>
    </section>
  );
}

function RankingsCard({
  title,
  subtitle,
  unit,
  precision,
  info,
  items,
  nameById,
  hrefById,
}: {
  title: string;
  subtitle: string;
  unit: string;
  precision: number;
  info: string;
  items: RankingRow[];
  nameById: Map<number, string>;
  hrefById: Map<number, string>;
}) {
  return (
    <div className="rounded-lg bg-white/[0.05] border border-white/10 px-3 py-4 space-y-3">
      <div className="px-1 flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <h3 className="text-sm text-white/95 font-medium whitespace-nowrap">
            {title}
          </h3>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/40 whitespace-nowrap">
            {subtitle}
          </div>
        </div>
        <MetricInfo label={title} description={info} />
      </div>
      <ol className="space-y-1.5">
        {items.map((r) => (
          <li key={r.pitcher_id}>
            <Link
              href={hrefById.get(r.pitcher_id) ?? `/pitcher/${r.pitcher_id}`}
              className="flex items-center gap-2.5 px-1 py-1.5 rounded-md hover:bg-white/[0.06] transition-colors"
            >
              <span className="text-[10px] tabular-nums text-white/45 w-3 text-right">
                {r.rank}
              </span>
              <div className="relative w-7 h-7 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
                <Image
                  src={pitcherHeadshotUrl(r.pitcher_id, 64)}
                  alt=""
                  fill
                  sizes="28px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <span className="text-[12px] text-white/95 truncate flex-1">
                {nameById.get(r.pitcher_id) ?? `Pitcher #${r.pitcher_id}`}
              </span>
              <span className="text-[12px] tabular-nums text-white/85 flex-shrink-0">
                {Number(r.value).toFixed(precision)}
                <span className="text-white/45 ml-0.5 text-[10px]">{unit}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatPitcherName(p: {
  first_name: string | null;
  last_name: string | null;
  full_name: string;
}): string {
  if (p.first_name && p.last_name) {
    return `${p.first_name[0]}. ${p.last_name}`;
  }
  return p.full_name;
}
