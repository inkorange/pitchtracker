import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fallbackDisplaySeason } from "@/lib/season/current-season";
import { teamLogoUrl } from "@/lib/viz/headshot";
import { pitcherPagePath } from "@/lib/url/pitcher-slug";
import { absoluteUrl } from "@/lib/url/site";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { TeamMark } from "@/components/team/TeamMark";
import { getPitcherDirectoryForSeason, type DirectoryRow } from "@/lib/pitchers/directory";
import { fetchTeamSeasonStrikeouts } from "@/lib/statsapi/client";
import { StaffCards, type StaffMember } from "./StaffCards";

interface PageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ season?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { teamId: teamIdParam } = await params;
  const teamId = Number(teamIdParam);
  if (!Number.isFinite(teamId)) return { title: "Team" };
  const supabase = await createClient();
  const { data: team } = await supabase
    .from("pitch_teams")
    .select("name, abbreviation")
    .eq("mlb_id", teamId)
    .maybeSingle();
  if (!team) return { title: "Team" };
  const canonical = `/browse/${teamId}`;
  const title = `${team.name} pitchers`;
  const description = `Every active pitcher on the ${team.name}. Browse rosters, compare arsenals, and watch pitch-by-pitch 3D at-bat replays on PitchTracker.`;
  const ogImage = teamLogoUrl(teamId);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title: `${title} · PitchTracker`,
      description,
      images: [{ url: ogImage, alt: team.name }],
    },
    twitter: {
      card: "summary",
      title: `${title} · PitchTracker`,
      description,
      images: [ogImage],
    },
  };
}

// Team staff page — design/TeamStaff.dc.html.
export default async function TeamRosterPage({ params, searchParams }: PageProps) {
  const { teamId: teamIdParam } = await params;
  const { season: seasonParam } = await searchParams;
  const teamId = Number(teamIdParam);
  if (!Number.isFinite(teamId)) notFound();

  const supabase = await createClient();
  const { data: team } = await supabase
    .from("pitch_teams")
    .select("*")
    .eq("mlb_id", teamId)
    .maybeSingle();
  if (!team) notFound();

  // Years where we have a roster for this team.
  const { data: seasonRows } = await supabase
    .from("pitch_team_rosters")
    .select("season")
    .eq("team_id", teamId);
  const availableSeasons = Array.from(
    new Set((seasonRows ?? []).map((r) => r.season)),
  ).sort((a, b) => b - a);
  const season = seasonParam
    ? Number(seasonParam)
    // availableSeasons comes from our own rows so it normally wins;
    // the fallback only fires for a team with no cached seasons, and
    // must not be the calendar year (see current-season.ts).
    : (availableSeasons[0] ?? fallbackDisplaySeason());

  const { data: rosterRows } = await supabase
    .from("pitch_team_rosters")
    .select("pitcher_id, innings_pitched")
    .eq("team_id", teamId)
    .eq("season", season);
  const pitcherIds = (rosterRows ?? []).map((r) => r.pitcher_id);
  const [{ data: pitchers }, directory, teamK] = await Promise.all([
    pitcherIds.length > 0
      ? supabase.from("pitch_pitchers").select("mlb_id, full_name, throws").in("mlb_id", pitcherIds)
      : Promise.resolve({ data: [] as { mlb_id: number; full_name: string; throws: string | null }[] }),
    getPitcherDirectoryForSeason(season).catch(() => [] as DirectoryRow[]),
    fetchTeamSeasonStrikeouts(teamId, season).catch(() => null),
  ]);
  const statsById = new Map(directory.map((r) => [r.id, r]));

  // Most-used arms first; pitchers with no tracked pitches by name, last.
  const staff: StaffMember[] = (pitchers ?? [])
    .map((p) => ({
      id: p.mlb_id,
      name: p.full_name,
      href: `${pitcherPagePath(p.mlb_id, p.full_name)}?season=${season}`,
      hand: p.throws,
      stats: statsById.get(p.mlb_id) ?? null,
    }))
    .sort((a, b) => (b.stats?.pitches ?? -1) - (a.stats?.pitches ?? -1) || a.name.localeCompare(b.name));

  const tracked = staff.flatMap((p) => (p.stats ? [p.stats] : []));
  const pitchesTracked = tracked.reduce((s, r) => s + r.pitches, 0);
  const weighted = (get: (r: DirectoryRow) => number | null) => {
    const rated = tracked.filter((r) => get(r) != null);
    const n = rated.reduce((s, r) => s + r.pitches, 0);
    return n > 0 ? rated.reduce((s, r) => s + (get(r) as number) * r.pitches, 0) / n : null;
  };
  const staffWhiff = weighted((r) => r.whiffPerSwing);
  const staffFb = weighted((r) => r.fbMph);
  const kLeader = [...tracked].sort((a, b) => (b.strikeouts ?? 0) - (a.strikeouts ?? 0))[0];
  const compare = tracked.length >= 2
    ? `/compare?a=${tracked[0].id}&aSeason=${season}&b=${tracked[1].id}&bSeason=${season}`
    : null;

  // pitch_pitcher_aggregates only covers recent seasons (2026 at time
  // of writing). For older seasons show the roster and club K only.
  const hasArsenalStats = tracked.length > 0;
  const strip: [string, string][] = [
    ["Pitchers", String(staff.length)],
    ["Staff K", teamK != null ? teamK.toLocaleString() : "—"],
    ...(hasArsenalStats
      ? ([
          ["Whiff/swing %", staffWhiff != null ? staffWhiff.toFixed(1) : "—"],
          ["Avg FB mph", staffFb != null ? staffFb.toFixed(1) : "—"],
          ["Pitches tracked", pitchesTracked.toLocaleString()],
          ["K leader", kLeader ? kLeader.name.split(" ").slice(-1)[0] : "—"],
        ] as [string, string][])
      : []),
  ];

  // SportsTeam markup with the active roster of pitchers as athletes.
  // Helps Google build a knowledge-panel-style result for the team
  // page. Breadcrumb gives SERP the back-path.
  const teamJsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: team.name,
    sport: "Baseball",
    memberOf: { "@type": "SportsOrganization", name: "Major League Baseball" },
    url: absoluteUrl(`/browse/${team.mlb_id}`),
    athlete: staff.map((p) => ({
      "@type": "Person",
      name: p.name,
      url: absoluteUrl(pitcherPagePath(p.id, p.name)),
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Teams", item: absoluteUrl("/browse") },
      { "@type": "ListItem", position: 3, name: team.name, item: absoluteUrl(`/browse/${team.mlb_id}`) },
    ],
  };

  const seasons = availableSeasons.length ? availableSeasons.slice(0, 3) : [season];
  // "NL Central" from either "NL Central" or "National League Central".
  const divisionLabel = team.division.replace("American League", "AL").replace("National League", "NL");

  return (
    <main className="min-h-screen bg-bg text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(teamJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteHeader active="teams" />

      <section className="container-page pt-5 md:pt-8 pb-5 flex flex-col gap-4 md:gap-[18px]">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <ol className="list-none m-0 p-0 flex gap-2">
            <li>
              <Link href="/browse" className="text-muted hover:text-accent-hover">
                Teams
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-ink">
              {team.name}
            </li>
          </ol>
        </nav>

        <div className="flex justify-between items-end gap-5 flex-wrap">
          <div className="flex items-center gap-4 md:gap-6 min-w-0">
            <TeamMark teamId={team.mlb_id} name={team.name} size={152} padding={16} className="max-md:!size-[88px] max-md:!p-2.5" />
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="label-caps">{divisionLabel} · Pitching staff</span>
              <h1 className="m-0 font-display font-extrabold italic uppercase text-[40px] md:text-[60px] leading-[0.92]">
                {team.name}
              </h1>
            </div>
          </div>
          <div className="flex gap-2.5 items-center flex-wrap">
            {seasons.length > 1 ? (
              <nav aria-label="Season" className="flex bg-surface border border-line rounded-control p-1">
                {seasons.map((s) => (
                  <Link
                    key={s}
                    href={`/browse/${teamId}?season=${s}`}
                    aria-current={s === season ? "page" : undefined}
                    className={`h-[38px] px-3.5 flex items-center rounded-[3px] text-sm num ${
                      s === season ? "bg-ink text-bg font-bold hover:text-bg" : "text-ink-2 font-semibold hover:text-ink"
                    }`}
                  >
                    {s}
                  </Link>
                ))}
              </nav>
            ) : null}
            {compare ? (
              <Link
                href={compare}
                className="h-[46px] px-4 flex items-center rounded-control border border-line-strong text-sm font-semibold text-ink hover:border-ink-2"
              >
                Compare staff in 3D
              </Link>
            ) : null}
          </div>
        </div>

        <dl className={`m-0 grid grid-cols-2 ${hasArsenalStats ? "md:grid-cols-3 lg:grid-cols-6" : "md:max-w-md"} bg-surface border border-line border-t-[3px] border-t-accent rounded-control`}>
          {strip.map(([k, v]) => (
            <div key={k} className="px-3.5 py-3 border-r border-b lg:border-b-0 border-line flex flex-col min-w-0">
              <dt className="label-caps">{k}</dt>
              <dd className="m-0 font-display font-bold text-[30px] leading-[1.05] num truncate">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="container-page pb-16">
        {staff.length === 0 ? (
          <p className="text-muted">No roster available for this team in {season}.</p>
        ) : (
          <StaffCards staff={staff} />
        )}
        <p className="mt-6 mb-0 text-xs text-muted max-w-3xl">
          {hasArsenalStats
            ? "Staff K is the club’s season total from MLB. Per-pitcher K counts are season totals across all clubs. Whiff/swing % is misses per swing (pitch-weighted)."
            : `Per-pitcher arsenal stats aren’t cached for ${season}. Open any pitcher to see their full ${season} season in 3D.`}
        </p>
      </div>
    </main>
  );
}
