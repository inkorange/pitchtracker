import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { EyebrowTag } from "@/components/broadcast";
import { createClient } from "@/lib/supabase/server";
import { getCachedDisplaySeason } from "@/lib/pitcher/cached-reads";
import { getLeaderBadges } from "@/lib/teams/leader-badges";
import { TeamsGrid, type GridTeam } from "./TeamsGrid";

export const metadata: Metadata = {
  title: "Browse pitchers by team · PitchTracker",
  description:
    "All 30 MLB teams and their pitching staffs — jump to any pitcher's 3D arsenal in one click.",
  alternates: { canonical: "/browse" },
};

// Teams grid — design/Teams.dc.html.
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const displaySeason = await getCachedDisplaySeason();
  const seasons = [displaySeason, displaySeason - 1];
  const requested = Number((await searchParams).season);
  const season = seasons.includes(requested) ? requested : displaySeason;

  const supabase = await createClient();
  const [{ data: teamRows }, badges] = await Promise.all([
    supabase.from("pitch_teams").select("mlb_id, name, abbreviation, division, league").order("name"),
    getLeaderBadges(season),
  ]);
  const teams: GridTeam[] = (teamRows ?? []).map((t) => ({
    id: t.mlb_id,
    abbr: t.abbreviation,
    name: t.name,
    league: t.league,
    division: t.division,
    badge: badges.get(t.mlb_id) ?? null,
  }));

  return (
    <main className="min-h-screen bg-bg text-ink">
      <SiteHeader active="teams" />
      <section className="container-page pt-6 pb-4 md:pt-12 md:pb-6 flex flex-col gap-3 md:gap-3.5">
        <EyebrowTag className="self-start">Teams</EyebrowTag>
        <h1 className="m-0 font-display font-extrabold italic uppercase text-[46px] md:text-[64px] leading-[0.92]">
          Pick a staff.
        </h1>
        <p className="m-0 text-base md:text-[17px] leading-[1.55] text-ink-2 max-w-[680px]">
          Every club’s pitching staff by season. Open a team to compare its arms side by side, then
          drop into any pitcher in 3D.
        </p>
      </section>
      <div className="container-page pb-16 flex gap-3 flex-wrap items-start">
        <TeamsGrid
          teams={teams}
          season={season}
          seasonControl={
            <nav aria-label="Season" className="flex bg-surface border border-line rounded-control p-1">
              {seasons.map((s) => (
                <SeasonLink key={s} season={s} active={s === season} href={s === displaySeason ? "/browse" : `/browse?season=${s}`} />
              ))}
            </nav>
          }
        />
      </div>
    </main>
  );
}

function SeasonLink({ season, active, href }: { season: number; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`h-[42px] px-4 flex items-center rounded-[3px] text-sm num ${
        active ? "bg-ink text-bg font-bold hover:text-bg" : "text-ink-2 font-semibold hover:text-ink"
      }`}
    >
      {season}
    </Link>
  );
}
