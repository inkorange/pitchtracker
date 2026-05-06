import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { teamLogoUrl, pitcherHeadshotUrl } from "@/lib/viz/headshot";
import { TopNav } from "@/components/chrome/TopNav";

interface PageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ season?: string }>;
}

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
    : (availableSeasons[0] ?? new Date().getFullYear());

  // Roster for this team × season.
  const { data: rosterRows } = await supabase
    .from("pitch_team_rosters")
    .select("pitcher_id, innings_pitched")
    .eq("team_id", teamId)
    .eq("season", season);
  const pitcherIds = (rosterRows ?? []).map((r) => r.pitcher_id);
  const { data: pitchers } = pitcherIds.length > 0
    ? await supabase
        .from("pitch_pitchers")
        .select("mlb_id, full_name, throws, debut_year")
        .in("mlb_id", pitcherIds)
    : { data: [] };
  const sortedPitchers = (pitchers ?? []).slice().sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 pt-20 pb-12">
      <TopNav back={{ href: "/browse", label: "All teams" }} title="Team" />
      <div className="max-w-4xl mx-auto space-y-10">
        <header className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 flex-shrink-0">
              <Image
                src={teamLogoUrl(team.mlb_id)}
                alt={team.name}
                fill
                sizes="56px"
                className="object-contain"
                unoptimized
              />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
              <div className="text-[11px] uppercase tracking-[0.12em] text-white/45">
                {team.abbreviation} · {team.division}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">Season</span>
            <div className="flex gap-1">
              {(availableSeasons.length ? availableSeasons : [season]).map((s) => (
                <Link
                  key={s}
                  href={`/browse/${teamId}?season=${s}`}
                  className={`px-2 py-0.5 text-[11px] tabular-nums rounded ${
                    s === season
                      ? "bg-white/12 text-white"
                      : "text-white/55 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  {s}
                </Link>
              ))}
            </div>
          </div>
        </header>

        {sortedPitchers.length === 0 ? (
          <div className="text-sm text-white/55">
            No roster available for this team in {season}.
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedPitchers.map((p) => (
              <li key={p.mlb_id}>
                <Link
                  href={`/pitcher/${p.mlb_id}?season=${season}`}
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
                  <div className="min-w-0">
                    <div className="text-sm text-white/95 truncate">{p.full_name}</div>
                    <div className="text-[11px] text-white/45 tabular-nums">
                      {p.throws ? `${p.throws}HP` : "—"}
                      {p.debut_year ? ` · debut ${p.debut_year}` : ""}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
