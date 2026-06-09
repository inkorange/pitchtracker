import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { fetchPersonsCached } from "@/lib/statsapi/client";
import { pitcherHeadshotUrl } from "@/lib/viz/headshot";
import { atBatPath } from "@/lib/url/pitcher-slug";

// Compact strip of the latest two daily picks. Renders nothing (without
// breaking the page) when the cron hasn't been run yet.
export async function DailyPickStrip() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("pitch_daily_features")
    .select("*")
    .order("feature_date", { ascending: false })
    .limit(10);

  const features = rows ?? [];
  const pitchOfDay = features.find((f) => f.feature_kind === "pitch_of_the_day");
  const whiffOfWeek = features.find((f) => f.feature_kind === "whiff_of_the_week");
  const items = [pitchOfDay, whiffOfWeek].filter(
    (f): f is NonNullable<typeof pitchOfDay> => f !== undefined,
  );
  if (items.length === 0) return null;

  const playerIds = new Set<number>();
  for (const f of items) {
    if (f.pitcher_id) playerIds.add(f.pitcher_id);
    if (f.batter_id) playerIds.add(f.batter_id);
  }
  const [{ data: pitcherRows }, batterMap] = await Promise.all([
    playerIds.size > 0
      ? supabase
          .from("pitch_pitchers")
          .select("mlb_id, full_name")
          .in("mlb_id", Array.from(playerIds))
      : Promise.resolve({ data: [] }),
    fetchPersonsCached(Array.from(playerIds)),
  ]);
  const pitcherById = new Map(
    (pitcherRows ?? []).map((p) => [p.mlb_id, p.full_name]),
  );
  const resolveName = (id: number | null) => {
    if (!id) return "—";
    return (
      pitcherById.get(id) ?? batterMap.get(id)?.fullName ?? `Player #${id}`
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-white/55">
          Today
        </h2>
        <Link
          href="/daily"
          className="text-[10px] uppercase tracking-[0.14em] text-white/45 hover:text-white/80 transition-colors"
        >
          All daily picks →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((f) => {
          const pitcherName = f.pitcher_id
            ? pitcherById.get(f.pitcher_id) ?? null
            : null;
          const batterName = f.batter_id
            ? batterMap.get(f.batter_id)?.fullName ?? null
            : null;
          const href = pitcherName
            ? `${atBatPath(f.game_pk, f.at_bat_number, pitcherName, batterName)}?pitch=${f.pitch_number}`
            : `/at-bat/${f.game_pk}/${f.at_bat_number}?pitch=${f.pitch_number}`;
          return (
          <Link
            key={`${f.feature_kind}-${f.feature_date}`}
            href={href}
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 transition-colors"
          >
            {f.pitcher_id ? (
              <div className="relative w-12 h-12 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
                <Image
                  src={pitcherHeadshotUrl(f.pitcher_id, 120)}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : null}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
                {f.feature_kind === "pitch_of_the_day"
                  ? "Pitch of the Day"
                  : "Whiff of the Week"}
              </div>
              <div className="text-sm text-white/95 font-medium truncate">
                {resolveName(f.pitcher_id)}
              </div>
              <div className="text-[11px] text-white/55 truncate">
                {f.reason ?? "vs " + resolveName(f.batter_id)}
              </div>
            </div>
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
              Watch →
            </span>
          </Link>
          );
        })}
      </div>
    </section>
  );
}
