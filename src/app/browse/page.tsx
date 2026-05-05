import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { teamLogoUrl } from "@/lib/viz/headshot";

const DIVISION_ORDER = [
  "AL East",
  "AL Central",
  "AL West",
  "NL East",
  "NL Central",
  "NL West",
];

export default async function BrowsePage() {
  const supabase = await createClient();
  const { data: teams } = await supabase
    .from("pitch_teams")
    .select("mlb_id, name, abbreviation, division, league")
    .order("name");

  const byDivision = new Map<string, typeof teams>();
  for (const t of teams ?? []) {
    const list = byDivision.get(t.division) ?? [];
    list.push(t);
    byDivision.set(t.division, list);
  }

  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 py-12">
      <div className="max-w-5xl mx-auto space-y-10">
        <header className="space-y-2">
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors"
          >
            ← pitchtracker
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Browse by team</h1>
          <p className="text-sm text-white/50">
            Pick a team, then a season, then a pitcher.
          </p>
        </header>

        {DIVISION_ORDER.map((division) => {
          const list = byDivision.get(division);
          if (!list || list.length === 0) return null;
          return (
            <section key={division} className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                {division}
              </div>
              <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {list.map((t) => (
                  <li key={t.mlb_id}>
                    <Link
                      href={`/browse/${t.mlb_id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/15 transition-colors"
                    >
                      <div className="relative w-9 h-9 flex-shrink-0">
                        <Image
                          src={teamLogoUrl(t.mlb_id)}
                          alt={t.name}
                          fill
                          sizes="36px"
                          className="object-contain"
                          unoptimized
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-white/45">
                          {t.abbreviation}
                        </div>
                        <div className="text-sm text-white/90 truncate">{t.name}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
