import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { fetchPersonsCached } from "@/lib/statsapi/client";
import { atBatPath } from "@/lib/url/pitcher-slug";
import { SectionHeader } from "./SectionHeader";

// Daily picks — design/Main.dc.html "HIGHLIGHTS".
//
// Staleness framing: the query takes the newest row with no recency
// bound — a pick should never vanish because the cron ran late — but
// once the postseason ends there's nothing newer until Opening Day.
// So the labels switch from "Pitch of the Day" to "Final pitch of the
// season" rather than hiding the content. The clock read lives here,
// outside the component body, to keep the render pure.
const STALE_AFTER_DAYS = 4;

function isStalePick(gameDates: Array<string | null>): boolean {
  const newest = gameDates
    .filter((d): d is string => typeof d === "string" && d.length > 0)
    .sort()
    .pop();
  if (!newest) return false;
  // Midday UTC so a date-only value doesn't land on the wrong side of
  // a timezone boundary.
  const ageDays = (Date.now() - Date.parse(`${newest}T12:00:00Z`)) / 86_400_000;
  return ageDays > STALE_AFTER_DAYS;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "2026-10-28" → "OCT 28". */
export function formatPickDate(iso: string | null): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}`;
}

export async function DailyPickStrip() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("pitch_daily_features")
    .select("*")
    // Order by the GAME date, not the cron run date — the run date can
    // sit a day ahead of the pitch it points at when a run fails.
    .order("game_date", { ascending: false })
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
  const pitcherById = new Map((pitcherRows ?? []).map((p) => [p.mlb_id, p.full_name]));
  const resolveName = (id: number | null) => {
    if (!id) return "—";
    return pitcherById.get(id) ?? batterMap.get(id)?.fullName ?? `Player #${id}`;
  };

  const isStale = isStalePick(items.map((f) => f.game_date));

  return (
    <section className="container-page py-8 md:py-14" aria-labelledby="picks-h">
      <SectionHeader
        id="picks-h"
        title="Daily picks"
        aside={
          <Link
            href="/daily"
            className="text-sm font-semibold min-h-11 flex items-center text-ink hover:text-accent-hover"
          >
            <span className="md:hidden">All →</span>
            <span className="hidden md:inline">All daily picks →</span>
          </Link>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((f) => {
          const pitcherName = f.pitcher_id ? (pitcherById.get(f.pitcher_id) ?? null) : null;
          const batterName = f.batter_id ? (batterMap.get(f.batter_id)?.fullName ?? null) : null;
          const href = pitcherName
            ? `${atBatPath(f.game_pk, f.at_bat_number, pitcherName, batterName)}?pitch=${f.pitch_number}`
            : `/at-bat/${f.game_pk}/${f.at_bat_number}?pitch=${f.pitch_number}`;
          const label =
            f.feature_kind === "pitch_of_the_day"
              ? isStale
                ? "Final pitch of the season"
                : "Pitch of the Day"
              : isStale
                ? "Final whiff of the season"
                : "Whiff of the Week";
          return (
            <Link
              key={`${f.feature_kind}-${f.game_date}`}
              href={href}
              className="group flex flex-col md:flex-row items-stretch bg-surface border border-line rounded-control overflow-hidden text-ink hover:text-ink hover:border-line-strong transition-colors"
            >
              <div className="relative h-[150px] md:h-auto md:w-[200px] shrink-0 bg-bg-raised overflow-hidden">
                <Image
                  src="/field-background.jpg"
                  alt=""
                  fill
                  sizes="(min-width: 768px) 200px, 100vw"
                  className="object-cover object-[50%_45%] opacity-60 transition-transform duration-300 group-hover:scale-105"
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="size-[52px] rounded-full bg-accent flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="#fff">
                      <path d="M7 4l13 8-13 8z" />
                    </svg>
                  </span>
                </span>
              </div>
              <div className="px-[18px] py-4 md:px-6 md:py-5 flex flex-col gap-1 md:gap-1.5 min-w-0">
                {/* Date beside the label: without it a frozen pick is
                    indistinguishable from a fresh one. */}
                <span className="font-display font-bold text-sm md:text-[15px] tracking-[1.5px] uppercase text-highlight">
                  {label} · {formatPickDate(f.game_date)}
                </span>
                <span className="font-display font-extrabold text-[26px] md:text-[30px] leading-none">
                  {resolveName(f.pitcher_id)}
                </span>
                {f.reason ? <span className="text-sm md:text-[15px] text-ink-2">{f.reason}</span> : null}
                {f.batter_id ? (
                  <span className="text-[13px] text-muted">vs {resolveName(f.batter_id)}</span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
