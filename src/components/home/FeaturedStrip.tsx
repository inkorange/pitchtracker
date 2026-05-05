import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";

// Hand-curated until the league-leader cron lands. These are pitchers who
// are guaranteed to be in pitch_pitchers (active 2026 roster).
const CURATED_FEATURED_IDS = [
  694973, // Paul Skenes
  669373, // Tarik Skubal
  675911, // Spencer Strider
  657277, // Logan Webb
  554430, // Zack Wheeler
  808967, // Yoshinobu Yamamoto
  669302, // Logan Gilbert
  657746, // Joe Ryan
  656302, // Dylan Cease
  519242, // Chris Sale
  665795, // Edward Cabrera
  676979, // Garrett Crochet
];

export async function FeaturedStrip() {
  const supabase = await createClient();
  const { data: pitchers } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id, full_name, throws, current_team_id")
    .in("mlb_id", CURATED_FEATURED_IDS);

  if (!pitchers || pitchers.length === 0) return null;

  const ordered = CURATED_FEATURED_IDS.map((id) =>
    pitchers.find((p) => p.mlb_id === id),
  ).filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <section className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
        Featured pitchers
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {ordered.map((p) => (
          <li key={p.mlb_id}>
            <Link
              href={`/pitcher/${p.mlb_id}`}
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
