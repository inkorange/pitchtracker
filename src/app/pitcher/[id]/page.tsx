import type { Metadata } from "next";
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
import { PitcherSearchPopover } from "@/components/chrome/PitcherSearchPopover";
import { SeasonPicker } from "@/components/filters/SeasonPicker";
import { OutcomeLegend } from "@/app/compare/OutcomeLegend";
import { TopNav } from "@/components/chrome/TopNav";
import { FiltersGate } from "./FiltersGate";
import { MatchupsPanel } from "./MatchupsPanel";
import { PitcherCardCollapse } from "./PitcherCardCollapse";
import { AtBatHeader } from "./AtBatHeader";
import { PitcherBody } from "./PitcherBody";
import { StatsModeToggle } from "./StatsModeToggle";
import { PitcherFilters } from "@/components/filters/PitcherFilters";
import { PitcherStatsArea } from "./PitcherStatsArea";
import { PitcherOutcomeLegendGate } from "./PitcherOutcomeLegendGate";
import { expandAtBatEvents } from "@/lib/at-bat-events";
import { buildFilterSummary } from "@/lib/filter-summary";
import { fetchPitcherGameLine, type MlbPitcherGameLine } from "@/lib/statsapi/client";
import { PitcherGameStats } from "./PitcherGameStats";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    season?: string;
    pitch?: string;
    hand?: string;
    game?: string;
    outcome?: string;
    // Comma-separated chip keys (strikeout, walk, hit, home_run, out,
    // hit_by_pitch) or raw MLB event values. Expanded into the full
    // event set in `expandAtBatEvents`. Applied at the at-bat level:
    // keeps every pitch in any AB whose terminating pitch's `events`
    // is in the expanded set.
    event?: string;
    // Velocity range in mph (release_speed). Either bound may be omitted
    // for a one-sided filter. Used for "show me pitches over 95" queries.
    veloMin?: string;
    veloMax?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const pitcherId = Number(id);
  if (!Number.isFinite(pitcherId)) {
    return { title: "Pitcher" };
  }
  const supabase = await createClient();
  const { data: pitcher } = await supabase
    .from("pitch_pitchers")
    .select("full_name, throws, current_team_id, debut_year")
    .eq("mlb_id", pitcherId)
    .maybeSingle();
  if (!pitcher) {
    return { title: "Pitcher" };
  }
  let teamName: string | null = null;
  if (pitcher.current_team_id) {
    const { data: team } = await supabase
      .from("pitch_teams")
      .select("name")
      .eq("mlb_id", pitcher.current_team_id)
      .maybeSingle();
    teamName = team?.name ?? null;
  }
  const throwsLabel = pitcher.throws === "L" ? "left-handed" : pitcher.throws === "R" ? "right-handed" : null;
  const descParts: string[] = [];
  if (throwsLabel) descParts.push(throwsLabel);
  if (teamName) descParts.push(teamName);
  if (pitcher.debut_year) descParts.push(`MLB debut ${pitcher.debut_year}`);
  const description = descParts.length
    ? `${pitcher.full_name} — ${descParts.join(", ")}. Pitch-by-pitch 3D arsenal, movement plot, velocity histograms, and at-bat replay on pitchtracker.`
    : `${pitcher.full_name}'s pitch arsenal rendered in 3D — movement, velocity, and at-bat replay on pitchtracker.`;
  const headshotUrl = pitcherHeadshotUrl(pitcherId, 360);
  const canonical = `/pitcher/${pitcherId}`;
  return {
    title: pitcher.full_name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      url: canonical,
      title: `${pitcher.full_name} · pitchtracker`,
      description,
      images: [{ url: headshotUrl, alt: pitcher.full_name }],
    },
    twitter: {
      card: "summary",
      title: `${pitcher.full_name} · pitchtracker`,
      description,
      images: [headshotUrl],
    },
  };
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
      "game_pk, at_bat_number, pitch_number, pitch_type, stand, description, events, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension, pitch_games!inner(season, game_date, home_team_id, away_team_id, game_type)",
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
  // At-bat-result filter. Narrows to the TERMINATING pitch of each AB
  // (the one whose Statcast `events` column is set) — i.e., the actual
  // pitch that resulted in the strikeout / walk / hit / etc. Chip keys
  // like "strikeout" expand to ["strikeout", "strikeout_double_play"]
  // so viewers get natural-language behavior.
  const atBatEventInputs = (sp.event ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const atBatEventSet = expandAtBatEvents(atBatEventInputs);
  // Velocity bounds in mph. Either side may be unset for an open-ended
  // range. Applied at the same level as outcome/event so the arsenal
  // aggregates and pitch-type chip counts respect it.
  const veloMin = sp.veloMin && !Number.isNaN(Number(sp.veloMin)) ? Number(sp.veloMin) : null;
  const veloMax = sp.veloMax && !Number.isNaN(Number(sp.veloMax)) ? Number(sp.veloMax) : null;
  const arsenalPitches = (cachedPitches ?? []).filter((p) => {
    if (outcomeSet.size > 0 && !outcomeSet.has(categorizeDescription(p.description))) {
      return false;
    }
    if (atBatEventSet.size > 0) {
      if (!p.events || !atBatEventSet.has(p.events)) return false;
    }
    if (veloMin != null) {
      if (p.release_speed == null || p.release_speed < veloMin) return false;
    }
    if (veloMax != null) {
      if (p.release_speed == null || p.release_speed > veloMax) return false;
    }
    return true;
  });
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
          .select("mlb_id, abbreviation, name")
          .in("mlb_id", Array.from(teamIds))
      : { data: [] };
  const teamAbbr = new Map<number, string>(
    (teamRows ?? []).map((t) => [t.mlb_id, t.abbreviation]),
  );
  // Full names for the filter-summary banner — "vs Boston Red Sox"
  // reads better than "vs BOS" when the user expands the URL.
  const teamFullName = new Map<number, string>(
    (teamRows ?? []).map((t) => [t.mlb_id, t.name]),
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

  // Resolve the currently-filtered game (if any) to a date + opponent
  // name for the filter-summary banner.
  let activeGameInfo: { game_date: string; opponentName: string | null } | null = null;
  if (sp.game) {
    const activeGamePk = Number(sp.game);
    const meta = gameByPk.get(activeGamePk);
    if (meta) {
      const pitcherTeamId = pitcher.current_team_id ?? null;
      const opponentId =
        pitcherTeamId != null && meta.home_team_id === pitcherTeamId
          ? meta.away_team_id
          : pitcherTeamId != null && meta.away_team_id === pitcherTeamId
            ? meta.home_team_id
            : (meta.home_team_id ?? meta.away_team_id);
      activeGameInfo = {
        game_date: meta.game_date,
        opponentName: opponentId ? (teamFullName.get(opponentId) ?? null) : null,
      };
    }
  }

  // Game line panel — only when ?game=N is active. The official line
  // comes from the MLB boxscore (matches what fans see on MLB.com);
  // XBH is derived from our cached pitch events for this pitcher in
  // this game, since boxscore pitching stats don't break out 2B/3B.
  let gameLine: MlbPitcherGameLine | null = null;
  let xbhInGame = 0;
  if (sp.game && activeGameInfo) {
    const activeGamePk = Number(sp.game);
    try {
      gameLine = await fetchPitcherGameLine(activeGamePk, pitcherId);
    } catch {
      // Network blip — render without the line. Stats panel is hidden.
    }
    if (cachedPitches) {
      for (const p of cachedPitches) {
        if (
          p.game_pk === activeGamePk &&
          p.events != null &&
          (p.events === "double" ||
            p.events === "triple" ||
            p.events === "home_run")
        ) {
          xbhInGame += 1;
        }
      }
    }
  }

  const filterSummary = buildFilterSummary({
    season,
    pitchTypes,
    outcomes,
    events: atBatEventInputs,
    hand: sp.hand === "L" || sp.hand === "R" ? sp.hand : null,
    game: activeGameInfo,
    veloMin,
    veloMax,
  });

  // Schema.org Person markup — helps Google generate richer SERP
  // entries (sidebar card with image, "Plays for: <team>", etc.).
  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: pitcher.full_name,
    jobTitle: "Baseball Pitcher",
    image: pitcherHeadshotUrl(pitcher.mlb_id, 480),
    affiliation: team ? { "@type": "SportsTeam", name: team.name } : undefined,
    sameAs: [`https://www.mlb.com/player/${pitcher.mlb_id}`],
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Pitchers", item: "/browse" },
      {
        "@type": "ListItem",
        position: 3,
        name: pitcher.full_name,
        item: `/pitcher/${pitcher.mlb_id}`,
      },
    ],
  };

  return (
    <>
      {/* Scene + <main> wrapper live in /pitcher/layout.tsx so the
          3D canvas stays mounted across pitcher swaps. This page
          owns only the panels + chrome that should rebuild on
          pitcher change. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <PitcherOutcomeLegendGate>
        <OutcomeLegend />
      </PitcherOutcomeLegendGate>

      <TopNav
        back={{ href: "/", label: "Home" }}
        title="Pitcher"
        summary={filterSummary}
        rightSlot={
          <div className="flex items-center gap-1">
            <Link
              href={`/compare?a=${pitcher.mlb_id}&aSeason=${season}`}
              className="px-2.5 py-1 rounded-md bg-white/[0.12] hover:bg-white/[0.2] border border-white/20 text-white text-[10px] uppercase tracking-[0.14em] transition-colors"
            >
              Compare
            </Link>
            <PitcherSearchPopover />
          </div>
        }
      />

      {/* Card column. Absolute wrapper that holds the pitcher card AND
          the mobile-only summary banner stacked below it. Flex-col so
          the summary sits right beneath the card regardless of whether
          the card is collapsed (short) or expanded (tall + scrolling).
          `data-pitcher-card-column` marks the wrapper so PitcherStatsArea
          can anchor below the WHOLE column (card + summary), not just
          the card section — otherwise the summary banner overlaps the
          stat cards on mobile in stats mode. */}
      <div
        data-pitcher-card-column
        className="absolute top-16 left-3 right-3 sm:left-6 sm:right-auto z-20 sm:w-[340px] pointer-events-auto flex flex-col gap-2 max-h-[calc(100vh-5rem)]"
      >
      <section
        data-pitcher-card
        className="rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg p-4 overflow-y-auto min-h-0"
      >
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
                  <div className="hidden sm:block relative w-14 h-14 flex-shrink-0">
                    <Image
                      src={teamLogoUrl(team.mlb_id)}
                      alt={team.name}
                      fill
                      sizes="56px"
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

              {/* Arsenal / Stats mode toggle. Rendered OUTSIDE
                  FiltersGate — the view toggle is not a per-side
                  filter and must stay reachable in at-bat playback so
                  the user can flip over to the batter-scoped stats
                  view without losing the AB context. */}
              <StatsModeToggle />
            </>
          }
          body={
            <PitcherBody
              arsenal={
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-2">Arsenal</div>
                  {(aggregates ?? []).length === 0 ? (
                    <div className="text-xs text-white/55 leading-relaxed">
                      No arsenal data for {season}.
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {aggregates!.map((a) => (
                        <li key={a.pitch_type} className="space-y-0.5">
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
              }
              filters={
                /* Per-side filters live inside the FiltersGate so they
                   collapse out of the way when at-bat mode is active. */
                <FiltersGate>
                  <div className="border-t border-white/[0.08] pt-3">
                    <PitcherFilters
                      arsenal={(aggregates ?? []).map((a) => ({
                        pitch_type: a.pitch_type,
                        pitch_count: a.pitch_count,
                      }))}
                      games={games}
                      season={season}
                      gameStatsSlot={
                        gameLine ? (
                          <PitcherGameStats
                            line={gameLine}
                            xbh={xbhInGame}
                            gameDate={activeGameInfo?.game_date ?? null}
                            opponentName={activeGameInfo?.opponentName ?? null}
                          />
                        ) : null
                      }
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
              }
              matchups={
                /* Pitcher-vs-batter matchups: typeahead → at-bat list → playback. */
                <div className="border-t border-white/[0.08] pt-3 space-y-2">
                  <MatchupsPanel season={season} />
                </div>
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

      {/* Mobile-only filter-summary banner. Lives in the top nav on
          desktop. Anchored just below the card via the flex-col
          wrapper so it tracks the card's bottom edge whether the body
          is collapsed or expanded. */}
      {filterSummary ? (
        <div className="sm:hidden flex-shrink-0 text-[12px] leading-snug text-white/85 italic bg-[#081a32]/70 backdrop-blur-md border border-white/10 rounded-md px-3 py-1.5 shadow-lg">
          {filterSummary}
        </div>
      ) : null}
      </div>

      {/* Stats analytics view — sibling of the pitcher card, NOT
          inside it. Renders nothing in arsenal mode. */}
      <PitcherStatsArea />
    </>
  );
}


