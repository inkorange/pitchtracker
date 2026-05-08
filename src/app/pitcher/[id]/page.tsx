import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensurePitcherSeasonCache } from "@/lib/cache/backfill";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";
import {
  categorizeDescription,
  getPitchLabel,
  getPitchColor,
  type OutcomeCategory,
} from "@/lib/viz/colors";
import { PitcherSearch } from "@/components/search/PitcherSearch";
import { SeasonPicker } from "@/components/filters/SeasonPicker";
import { OutcomeLegend } from "@/app/compare/OutcomeLegend";
import { TopNav } from "@/components/chrome/TopNav";
import { FiltersGate } from "./FiltersGate";
import { MatchupsPanel } from "./MatchupsPanel";
import { PitcherCardCollapse } from "./PitcherCardCollapse";
import { AtBatHeader } from "./AtBatHeader";
import { PitcherOutcomeLegend } from "./PitcherOutcomeLegend";
import { PitcherBody } from "./PitcherBody";
import { StatsModeToggle } from "./StatsModeToggle";
import { PitcherFiltersWrapper } from "./PitcherFiltersWrapper";
import { PitcherStatsArea } from "./PitcherStatsArea";
import { PitcherOutcomeLegendGate } from "./PitcherOutcomeLegendGate";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    season?: string;
    pitch?: string;
    hand?: string;
    game?: string;
    outcome?: string;
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

  const currentYear = new Date().getFullYear();
  const season = sp.season ? Number(sp.season) : currentYear;

  // Season picker offers a fixed window: from current year back to the
  // pitcher's debut (or 6 years if debut isn't known). We never query
  // cross-season aggregates or game lists just to populate this list —
  // the user picks one year at a time and we only ever load that year's
  // pitches.
  const FALLBACK_YEARS = 6;
  const earliestSelectableYear = pitcher.debut_year
    ? Math.max(pitcher.debut_year, currentYear - FALLBACK_YEARS - 6)
    : currentYear - FALLBACK_YEARS;
  const availableSeasons: number[] = [];
  for (let y = currentYear; y >= earliestSelectableYear; y--) {
    availableSeasons.push(y);
  }

  // First-visit lazy backfill: if no pitches are cached for this pitcher
  // × season yet, pull from Savant on demand. No-op once cached.
  await ensurePitcherSeasonCache(pitcherId, season);

  // Single query scoped to active season: a Postgrest inner-join filter
  // on pitch_games.season returns only this pitcher's pitches in this
  // year, with the per-game metadata embedded for the dropdown. No
  // cross-season fetch, no full-schedule materialization.
  type EmbeddedGame = {
    season: number;
    game_date: string;
    home_team_id: number | null;
    away_team_id: number | null;
  };
  let pitchQuery = supabase
    .from("pitch_game_pitches")
    .select(
      "game_pk, at_bat_number, pitch_number, pitch_type, pitch_name, stand, description, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension, pitch_games!inner(season, game_date, home_team_id, away_team_id, game_type)",
    )
    .eq("pitcher_id", pitcherId)
    .eq("pitch_games.season", season)
    .eq("pitch_games.game_type", "R")
    .range(0, 4999);
  if (sp.hand === "L" || sp.hand === "R") {
    pitchQuery = pitchQuery.eq("stand", sp.hand);
  }
  if (sp.game) {
    pitchQuery = pitchQuery.eq("game_pk", Number(sp.game));
  }

  const { data: cachedPitchesRaw } = await pitchQuery;
  const cachedPitches = cachedPitchesRaw as
    | (NonNullable<typeof cachedPitchesRaw>[number] & { pitch_games?: EmbeddedGame })[]
    | null;

  // Arsenal totals come from the filter-but-no-pitch-type set so the chips
  // remain functional when one is selected. Outcomes filter applies in JS
  // — Statcast description strings have too many edge cases to express
  // cleanly in SQL.
  const outcomes = (sp.outcome ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is OutcomeCategory =>
      ["whiff", "called", "ball", "foul", "inplay", "other"].includes(s),
    );
  const outcomeSet = new Set(outcomes);
  const arsenalPitches = (cachedPitches ?? []).filter(
    (p) => outcomeSet.size === 0 || outcomeSet.has(categorizeDescription(p.description)),
  );
  const pitchTypes = (sp.pitch ?? "").split(",").filter(Boolean);
  const pitchTypeSet = new Set(pitchTypes);
  const filteredPitches =
    pitchTypeSet.size === 0
      ? arsenalPitches
      : arsenalPitches.filter(
          (p) => p.pitch_type != null && pitchTypeSet.has(p.pitch_type),
        );
  const renderable = filteredPitches.filter(
    (p) => p.vx0 != null && p.vy0 != null && p.vz0 != null,
  );

  type AggBucket = { count: number; sumVel: number; nVel: number };
  const aggBuckets = new Map<string, AggBucket>();
  for (const p of arsenalPitches) {
    if (!p.pitch_type) continue;
    const b = aggBuckets.get(p.pitch_type) ?? { count: 0, sumVel: 0, nVel: 0 };
    b.count += 1;
    if (p.release_speed != null) {
      b.sumVel += p.release_speed;
      b.nVel += 1;
    }
    aggBuckets.set(p.pitch_type, b);
  }
  const totalArsenal = arsenalPitches.length;
  const aggregates = Array.from(aggBuckets.entries())
    .map(([pitch_type, b]) => ({
      pitch_type,
      pitch_count: b.count,
      usage_pct: totalArsenal > 0 ? (b.count / totalArsenal) * 100 : 0,
      avg_velocity: b.nVel > 0 ? b.sumVel / b.nVel : null,
    }))
    .sort((a, b) => b.pitch_count - a.pitch_count);

  // Game dropdown is fetched separately from the pitch query so that
  // applying ?game=N (which narrows cachedPitches to a single game)
  // doesn't collapse the dropdown to one option. Sourced from the
  // pitcher×game mapping table joined with pitch_games metadata.
  type GameMeta = {
    game_pk: number;
    game_date: string;
    home_team_id: number | null;
    away_team_id: number | null;
  };
  type PitcherGameJoinRow = {
    game_pk: number;
    pitch_games: {
      game_date: string;
      home_team_id: number | null;
      away_team_id: number | null;
      season: number;
      game_type: string | null;
    } | null;
  };
  const { data: pitcherGameRowsRaw } = await supabase
    .from("pitch_pitcher_games")
    .select(
      "game_pk, pitch_games!inner(game_date, home_team_id, away_team_id, season, game_type)",
    )
    .eq("pitcher_id", pitcherId)
    .eq("pitch_games.season", season)
    .eq("pitch_games.game_type", "R");
  const pitcherGameRows = (pitcherGameRowsRaw ?? []) as unknown as PitcherGameJoinRow[];
  const gameByPk = new Map<number, GameMeta>();
  for (const r of pitcherGameRows) {
    if (gameByPk.has(r.game_pk)) continue;
    const meta = r.pitch_games;
    if (!meta) continue;
    gameByPk.set(r.game_pk, {
      game_pk: r.game_pk,
      game_date: meta.game_date,
      home_team_id: meta.home_team_id,
      away_team_id: meta.away_team_id,
    });
  }
  const gameMetaRows = Array.from(gameByPk.values());
  const teamIds = new Set<number>();
  for (const g of gameMetaRows) {
    if (g.home_team_id) teamIds.add(g.home_team_id);
    if (g.away_team_id) teamIds.add(g.away_team_id);
  }
  const { data: teamRows } =
    teamIds.size > 0
      ? await supabase
          .from("pitch_teams")
          .select("mlb_id, abbreviation")
          .in("mlb_id", Array.from(teamIds))
      : { data: [] };
  const teamAbbr = new Map<number, string>(
    (teamRows ?? []).map((t) => [t.mlb_id, t.abbreviation]),
  );
  const games = gameMetaRows
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
    <>
      {/* Scene + <main> wrapper live in /pitcher/layout.tsx so the
          3D canvas stays mounted across pitcher swaps. This page
          owns only the panels + chrome that should rebuild on
          pitcher change. */}
      <PitcherOutcomeLegendGate>
        <OutcomeLegend />
      </PitcherOutcomeLegendGate>
      <PitcherOutcomeLegend />

      <TopNav
        back={{ href: "/", label: "Home" }}
        title="Pitcher"
        rightSlot={
          <Link
            href={`/compare?a=${pitcher.mlb_id}&aSeason=${season}`}
            className="px-2.5 py-1 rounded-md bg-white/[0.12] hover:bg-white/[0.2] border border-white/20 text-white text-[10px] uppercase tracking-[0.14em] transition-colors"
          >
            Compare
          </Link>
        }
      />
      {/* Pitcher search docked just below the nav on desktop; hidden
          on mobile to free vertical space. */}
      <div className="hidden sm:block absolute top-14 right-6 w-80 z-20 pointer-events-auto">
        <PitcherSearch placeholder="Search another pitcher…" />
      </div>

      <section className="absolute top-16 left-3 right-3 sm:left-6 sm:right-auto z-20 sm:w-[340px] rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg p-4 pointer-events-auto max-h-[calc(100vh-7rem)] overflow-y-auto">
        <PitcherCardCollapse
          header={
            <>
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
                <div className="min-w-0 flex-1">
                  <div className="text-base font-medium text-white truncate">{pitcher.full_name}</div>
                  <div className="text-[11px] text-white/55 tabular-nums">
                    {pitcher.throws ? `${pitcher.throws}HP` : "—"}
                    {team ? ` · ${team.abbreviation}` : ""}
                    {pitcher.debut_year ? ` · debut ${pitcher.debut_year}` : ""}
                  </div>
                </div>
                {team ? (
                  <div className="hidden sm:block relative w-10 h-10 flex-shrink-0">
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
              />

              {/* Arsenal / Stats mode toggle. Hidden during at-bat
                  playback (the toggle reads ?abGame + ?abNum and
                  bails on its own). */}
              <FiltersGate>
                <StatsModeToggle />
              </FiltersGate>
            </>
          }
          body={
            <PitcherBody
              arsenal={
                <>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-2">Arsenal</div>
                    {(aggregates ?? []).length === 0 ? (
                      <div className="text-xs text-white/55 leading-relaxed">
                        No arsenal data for {season}.
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {aggregates!.map((a) => (
                          <li
                            key={a.pitch_type}
                            className="space-y-0.5"
                          >
                            <div className="flex items-center gap-2 text-xs tabular-nums">
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
                              <span className="text-white/45 w-16 text-right">
                                {a.usage_pct != null
                                  ? `${Number(a.usage_pct).toFixed(0)}% (${a.pitch_count ?? 0})`
                                  : "—"}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

              {/* Per-side filters live inside the FiltersGate so they
                  collapse out of the way when at-bat mode is active.
                  When the user is replaying a specific AB, none of
                  these filters apply, so we hide them entirely. */}
              <FiltersGate>
                <div className="border-t border-white/[0.08] pt-3">
                  <PitcherFiltersWrapper
                    arsenal={(aggregates ?? []).map((a) => ({
                      pitch_type: a.pitch_type,
                      pitch_count: a.pitch_count,
                    }))}
                    games={games}
                    season={season}
                  />
                </div>

                {renderable.length > 0 && (
                  <div className="text-[11px] text-white/45 tabular-nums pt-2 border-t border-white/[0.05]">
                    Rendering {renderable.length} pitch{renderable.length === 1 ? "" : "es"}
                  </div>
                )}
                {(cachedPitches ?? []).length === 0 && (
                  <div className="text-[11px] text-white/40 leading-relaxed pt-2 border-t border-white/5">
                    No pitch trajectory data available for this filter.
                  </div>
                )}
              </FiltersGate>

                  {/* Pitcher-vs-batter matchups: typeahead → at-bat list →
                      at-bat playback. URL-state-backed, so the panel is
                      shareable. Composes inside the MobileCollapse body
                      so the matchups list rides the collapse on mobile. */}
                  <div className="border-t border-white/[0.08] pt-3 space-y-2">
                    <MatchupsPanel season={season} />
                  </div>
                </>
              }
            />
          }
        />

        {/* At-bat info card: lives outside the collapsing body so it
            stays on screen on mobile after the auto-collapse. Shows
            the active matchup's batter, outcome, and game context.
            Renders nothing when not in at-bat mode. */}
        <AtBatHeader season={season} />
      </section>

      {/* Stats analytics view — sibling of the pitcher card, NOT
          inside it. Renders nothing in arsenal mode. */}
      <PitcherStatsArea />
    </>
  );
}


