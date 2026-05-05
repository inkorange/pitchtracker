import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";
import { getPitchLabel, getPitchColor } from "@/lib/viz/colors";
import { PitcherArsenalScene } from "./PitcherArsenalScene";
import { PitcherSearch } from "@/components/search/PitcherSearch";
import { PitcherFilters } from "@/components/filters/PitcherFilters";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    season?: string;
    pitch?: string;
    hand?: string;
    game?: string;
  }>;
}

export default async function PitcherPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const pitcherId = Number(id);
  if (!Number.isFinite(pitcherId)) notFound();

  const supabase = await createClient();

  const { data: pitcher } = await supabase
    .from("pitch_pitchers")
    .select("*")
    .eq("mlb_id", pitcherId)
    .maybeSingle();
  if (!pitcher) notFound();

  const { data: seasonRows } = await supabase
    .from("pitch_pitcher_aggregates")
    .select("season")
    .eq("pitcher_id", pitcherId)
    .order("season", { ascending: false });
  const availableSeasons = Array.from(new Set((seasonRows ?? []).map((r) => r.season)));
  const season = sp.season ? Number(sp.season) : (availableSeasons[0] ?? new Date().getFullYear());

  const { data: aggregates } = await supabase
    .from("pitch_pitcher_aggregates")
    .select("*")
    .eq("pitcher_id", pitcherId)
    .eq("season", season)
    .eq("batter_hand", "*")
    .order("usage_pct", { ascending: false, nullsFirst: false });

  // Build the filtered cached-pitch query.
  let pitchQuery = supabase
    .from("pitch_game_pitches")
    .select(
      "game_pk, at_bat_number, pitch_number, pitch_type, pitch_name, stand, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z",
    )
    .eq("pitcher_id", pitcherId)
    .limit(1500);

  const pitchTypes = (sp.pitch ?? "").split(",").filter(Boolean);
  if (pitchTypes.length > 0) {
    pitchQuery = pitchQuery.in("pitch_type", pitchTypes);
  }
  if (sp.hand === "L" || sp.hand === "R") {
    pitchQuery = pitchQuery.eq("stand", sp.hand);
  }
  if (sp.game) {
    pitchQuery = pitchQuery.eq("game_pk", Number(sp.game));
  }

  const { data: cachedPitches } = await pitchQuery;
  const renderable = (cachedPitches ?? []).filter(
    (p) => p.vx0 != null && p.vy0 != null && p.vz0 != null,
  );

  // Distinct cached games for the game dropdown — two queries instead of a
  // dual-FK join, which PostgREST handles awkwardly.
  const { data: distinctGameRows } = await supabase
    .from("pitch_game_pitches")
    .select("game_pk")
    .eq("pitcher_id", pitcherId);
  const distinctGamePks = Array.from(
    new Set((distinctGameRows ?? []).map((r) => r.game_pk)),
  );
  const { data: gameMetaRows } =
    distinctGamePks.length > 0
      ? await supabase
          .from("pitch_games")
          .select("game_pk, game_date, home_team_id, away_team_id")
          .in("game_pk", distinctGamePks)
      : { data: [] };
  const teamIds = new Set<number>();
  for (const g of gameMetaRows ?? []) {
    if (g.home_team_id) teamIds.add(g.home_team_id);
    if (g.away_team_id) teamIds.add(g.away_team_id);
  }
  const { data: teamRows } = await supabase
    .from("pitch_teams")
    .select("mlb_id, abbreviation")
    .in("mlb_id", Array.from(teamIds));
  const teamAbbr = new Map<number, string>(
    (teamRows ?? []).map((t) => [t.mlb_id, t.abbreviation]),
  );
  const games = (gameMetaRows ?? [])
    .map((g) => ({
      game_pk: g.game_pk,
      game_date: g.game_date,
      away: g.away_team_id ? (teamAbbr.get(g.away_team_id) ?? "?") : "?",
      home: g.home_team_id ? (teamAbbr.get(g.home_team_id) ?? "?") : "?",
    }))
    .sort((a, b) => b.game_date.localeCompare(a.game_date));

  const team = pitcher.current_team_id
    ? await supabase
        .from("pitch_teams")
        .select("mlb_id, name, abbreviation")
        .eq("mlb_id", pitcher.current_team_id)
        .maybeSingle()
        .then((r) => r.data)
    : null;

  return (
    <main className="fixed inset-0 bg-[#0a0e14] overflow-hidden">
      <PitcherArsenalScene pitches={renderable} />

      <header className="absolute top-6 left-6 right-6 flex items-start justify-between gap-6 pointer-events-none">
        <div className="flex gap-4 items-center pointer-events-auto">
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors"
          >
            ← pitchtracker
          </Link>
        </div>
        <div className="w-80 pointer-events-auto">
          <PitcherSearch placeholder="Search another pitcher…" />
        </div>
      </header>

      <section className="absolute top-20 left-6 w-[340px] rounded-lg bg-white/[0.06] backdrop-blur-md border border-white/10 shadow-lg p-4 space-y-4 pointer-events-auto max-h-[calc(100vh-7rem)] overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
            <Image
              src={pitcherHeadshotUrl(pitcher.mlb_id, 120)}
              alt=""
              fill
              sizes="56px"
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="min-w-0">
            <div className="text-base font-medium text-white truncate">{pitcher.full_name}</div>
            <div className="text-[11px] text-white/55 tabular-nums">
              {pitcher.throws ? `${pitcher.throws}HP` : "—"}
              {team ? ` · ${team.abbreviation}` : ""}
              {pitcher.debut_year ? ` · debut ${pitcher.debut_year}` : ""}
            </div>
          </div>
          {team ? (
            <div className="relative w-10 h-10 flex-shrink-0">
              <Image
                src={teamLogoUrl(team.mlb_id)}
                alt={team.name}
                fill
                sizes="40px"
                className="object-contain"
                unoptimized
              />
            </div>
          ) : null}
        </div>

        <SeasonPicker
          pitcherId={pitcher.mlb_id}
          season={season}
          available={availableSeasons.length ? availableSeasons : [season]}
          searchParams={sp}
        />

        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-2">Arsenal</div>
          {(aggregates ?? []).length === 0 ? (
            <div className="text-xs text-white/55 leading-relaxed">
              No arsenal data cached for {season}.
            </div>
          ) : (
            <ul className="space-y-1">
              {aggregates!.map((a) => (
                <li
                  key={a.pitch_type}
                  className="flex items-center gap-2 text-xs tabular-nums"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: getPitchColor(a.pitch_type) }}
                  />
                  <span className="text-white/85 flex-1 truncate">
                    {getPitchLabel(a.pitch_type)}
                  </span>
                  <span className="text-white/55">
                    {a.avg_velocity != null ? `${Number(a.avg_velocity).toFixed(1)} mph` : "—"}
                  </span>
                  <span className="text-white/45 w-10 text-right">
                    {a.usage_pct != null ? `${Number(a.usage_pct).toFixed(0)}%` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-white/[0.08] pt-3">
          <PitcherFilters
            arsenal={(aggregates ?? []).map((a) => ({
              pitch_type: a.pitch_type,
              pitch_count: a.pitch_count,
            }))}
            games={games}
          />
        </div>

        {renderable.length > 0 && (
          <div className="text-[11px] text-white/45 tabular-nums pt-2 border-t border-white/[0.05]">
            Rendering {renderable.length} pitch{renderable.length === 1 ? "" : "es"}
          </div>
        )}
        {(cachedPitches ?? []).length === 0 && (
          <div className="text-[11px] text-white/40 leading-relaxed pt-2 border-t border-white/5">
            No pitch trajectory data cached yet for this filter.
          </div>
        )}
      </section>
    </main>
  );
}

function SeasonPicker({
  pitcherId,
  season,
  available,
  searchParams,
}: {
  pitcherId: number;
  season: number;
  available: number[];
  searchParams: { pitch?: string; hand?: string; game?: string };
}) {
  const preserved = new URLSearchParams();
  if (searchParams.pitch) preserved.set("pitch", searchParams.pitch);
  if (searchParams.hand) preserved.set("hand", searchParams.hand);
  // Don't preserve `game` across seasons — the game wouldn't apply.
  const suffix = preserved.toString();

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">Season</span>
      <div className="flex gap-1">
        {available.map((s) => (
          <Link
            key={s}
            href={`/pitcher/${pitcherId}?season=${s}${suffix ? `&${suffix}` : ""}`}
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
  );
}
