import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { pitcherHeadshotUrl } from "@/lib/viz/headshot";

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
  { key: "velo_ff", title: "Top Velocity", subtitle: "4-seam mph", unit: "mph", precision: 1 },
  { key: "strikeouts", title: "Most Strikeouts", subtitle: "season K count", unit: "K", precision: 0 },
  { key: "whiff_pct", title: "Top Whiff %", subtitle: "swstr per pitch", unit: "%", precision: 1 },
  { key: "csw_pct", title: "Top CSW %", subtitle: "called + swinging", unit: "%", precision: 1 },
  { key: "spin_ff", title: "Top Spin", subtitle: "4-seam rpm", unit: "rpm", precision: 0 },
  {
    key: "vaa_flat_ff",
    title: "Flattest VAA",
    subtitle: "4-seam approach°",
    unit: "°",
    precision: 2,
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

  // Resolve pitcher names in one round trip.
  const pitcherIds = Array.from(new Set(rankings.map((r) => r.pitcher_id)));
  const { data: pitcherRows } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id, full_name")
    .in("mlb_id", pitcherIds);
  const nameById = new Map<number, string>(
    (pitcherRows ?? []).map((p) => [p.mlb_id, p.full_name]),
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
              items={items}
              nameById={nameById}
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
  items,
  nameById,
}: {
  title: string;
  subtitle: string;
  unit: string;
  precision: number;
  items: RankingRow[];
  nameById: Map<number, string>;
}) {
  return (
    <div className="rounded-lg bg-white/[0.05] border border-white/10 px-3 py-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 className="text-sm text-white/95 font-medium">{title}</h3>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">
          {subtitle}
        </span>
      </div>
      <ol className="space-y-1.5">
        {items.map((r) => (
          <li key={r.pitcher_id}>
            <Link
              href={`/pitcher/${r.pitcher_id}`}
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
