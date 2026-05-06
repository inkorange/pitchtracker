import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensurePitcherSeasonCache } from "@/lib/cache/backfill";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";
import {
  categorizeDescription,
  getPitchColorForSide,
  getPitchLabel,
  type CompareSide,
  type OutcomeCategory,
} from "@/lib/viz/colors";
import { ComparisonScene } from "./ComparisonScene";
import { CompareSideFilters } from "./CompareSideFilters";
import { CompareSharedFilters } from "./CompareSharedFilters";
import { CompareLinkActions } from "./CompareLinkActions";
import { CompareSlotSearch } from "./CompareSlotSearch";
import { TunnelingPanel } from "./TunnelingPanel";
import { CompareHoverProvider, HoverableSide } from "./CompareHoverContext";
import { OutcomeLegend } from "./OutcomeLegend";

interface PageProps {
  searchParams: Promise<{
    a?: string;
    b?: string;
    aSeason?: string;
    bSeason?: string;
    aPitch?: string;
    bPitch?: string;
    aGame?: string;
    bGame?: string;
    // Batter side and outcome are shared across both pitchers — single
    // value applied to both datasets.
    hand?: string;
    outcome?: string;
    syncRelease?: string;
  }>;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const og = new URLSearchParams();
  if (sp.a) og.set("a", sp.a);
  if (sp.b) og.set("b", sp.b);
  if (sp.aSeason) og.set("aSeason", sp.aSeason);
  if (sp.bSeason) og.set("bSeason", sp.bSeason);
  const ogUrl = `/api/og/compare?${og.toString()}`;
  return {
    title: "Compare pitchers · pitchtracker",
    openGraph: {
      title: "Compare pitchers in 3D",
      description: "Two pitchers' arsenals overlaid in shared 3D space.",
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: [ogUrl],
    },
  };
}

export default async function ComparePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const aId = Number(sp.a);
  const bId = Number(sp.b);
  const haveA = Number.isFinite(aId);
  const haveB = Number.isFinite(bId);

  if (!haveA || !haveB) {
    return <EmptyState aId={haveA ? aId : null} bId={haveB ? bId : null} />;
  }

  const supabase = await createClient();
  const currentYear = new Date().getFullYear();

  const [{ data: aPitcher }, { data: bPitcher }] = await Promise.all([
    supabase.from("pitch_pitchers").select("*").eq("mlb_id", aId).maybeSingle(),
    supabase.from("pitch_pitchers").select("*").eq("mlb_id", bId).maybeSingle(),
  ]);

  if (!aPitcher || !bPitcher) {
    return <EmptyState aId={haveA ? aId : null} bId={haveB ? bId : null} />;
  }

  const aSeason = Number(sp.aSeason) || currentYear;
  const bSeason = Number(sp.bSeason) || currentYear;

  // Lazy backfill: pull from Savant on first visit per side × season.
  await Promise.all([
    ensurePitcherSeasonCache(aId, aSeason),
    ensurePitcherSeasonCache(bId, bSeason),
  ]);

  const sharedHand = parseHand(sp.hand);
  const sharedOutcomes = parseOutcomes(sp.outcome);

  const [aCtx, bCtx] = await Promise.all([
    loadSideContext(supabase, {
      pitcherId: aId,
      season: aSeason,
      pitchTypes: (sp.aPitch ?? "").split(",").filter(Boolean),
      hand: sharedHand,
      gamePk: parseGame(sp.aGame),
      outcomes: sharedOutcomes,
      currentYear,
    }),
    loadSideContext(supabase, {
      pitcherId: bId,
      season: bSeason,
      pitchTypes: (sp.bPitch ?? "").split(",").filter(Boolean),
      hand: sharedHand,
      gamePk: parseGame(sp.bGame),
      outcomes: sharedOutcomes,
      currentYear,
    }),
  ]);

  const [aTeam, bTeam] = await Promise.all([
    aPitcher.current_team_id ? fetchTeam(supabase, aPitcher.current_team_id) : null,
    bPitcher.current_team_id ? fetchTeam(supabase, bPitcher.current_team_id) : null,
  ]);

  // Default to true release (no normalization). Opposite-handed pitchers
  // look wrong when you collapse their arm slots into the same point;
  // the user opts into "Sync release" only when comparing same-handed
  // mechanics where shape difference is the focus.
  const syncRelease = sp.syncRelease === "1";

  return (
    <CompareHoverProvider>
      <main className="fixed inset-0 bg-[#0a0e14] overflow-hidden">
        <ComparisonScene
          aPitches={aCtx.pitches}
          bPitches={bCtx.pitches}
          aLabel={pitcherLabel(aPitcher)}
          bLabel={pitcherLabel(bPitcher)}
          normalizeRelease={syncRelease}
        />

        <header className="absolute top-6 left-6 right-6 z-20 flex items-start justify-between gap-6 pointer-events-none">
          <div className="flex gap-3 items-center pointer-events-auto">
            <Link
              href="/"
              className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors"
            >
              ← pitchtracker
            </Link>
            <CompareLinkActions />
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/45 pointer-events-none">
            Compare
          </div>
        </header>

        <OutcomeLegend />

        <section className="absolute top-20 left-6 z-20 w-[400px] rounded-lg bg-black/50 backdrop-blur-md border border-white/10 shadow-lg p-4 space-y-4 pointer-events-auto max-h-[calc(100vh-7rem)] overflow-y-auto">
          <HoverableSide side="a">
            <PitcherCard
              side="a"
              pitcher={aPitcher}
              team={aTeam}
              season={aCtx.season}
              aggregates={aCtx.aggregates}
              availableSeasons={aCtx.availableSeasons}
              games={aCtx.gameOptions}
            />
          </HoverableSide>
          <div className="border-t border-white/[0.08]" />
          <HoverableSide side="b">
            <PitcherCard
              side="b"
              pitcher={bPitcher}
              team={bTeam}
              season={bCtx.season}
              aggregates={bCtx.aggregates}
              availableSeasons={bCtx.availableSeasons}
              games={bCtx.gameOptions}
            />
          </HoverableSide>

          <div className="border-t border-white/[0.08]" />
          <CompareSharedFilters />

          <TunnelingPanel aPitches={aCtx.pitches} bPitches={bCtx.pitches} />

          <div className="text-[11px] tabular-nums text-white/45 pt-2 border-t border-white/[0.05] flex items-center justify-between">
            <span>
              {aCtx.pitches.length + bCtx.pitches.length} pitches rendered
            </span>
            <Link
              href={`/compare?${buildToggleQS(sp, "syncRelease", syncRelease ? null : "1")}`}
              className="text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white transition-colors"
            >
              {syncRelease ? "True release" : "Sync release"}
            </Link>
          </div>
        </section>
      </main>
    </CompareHoverProvider>
  );
}

interface SideContext {
  season: number;
  availableSeasons: number[];
  aggregates: AggRow[];
  pitches: PitchRow[];
  gameOptions: GameOption[];
}

async function loadSideContext(
  supabase: SupabaseClient,
  args: {
    pitcherId: number;
    season: number;
    pitchTypes: string[];
    hand: "L" | "R" | null;
    gamePk: number | null;
    outcomes: OutcomeCategory[];
    currentYear: number;
  },
): Promise<SideContext> {
  const { pitcherId, season, pitchTypes, hand, gamePk, outcomes, currentYear } = args;

  const { data: aggSeasonRows } = await supabase
    .from("pitch_pitcher_aggregates")
    .select("season")
    .eq("pitcher_id", pitcherId);

  // Single source of truth for "which games has this pitcher pitched
  // in." pitch_pitcher_games is bounded by games-per-pitcher (~30-80
  // per season), so an unfiltered query is safe — no row-cap risk.
  // pitch_game_pitches in contrast holds thousands of rows per pitcher
  // per season and silently truncates at PostgREST's 1000-row default.
  const { data: pitcherGameRows } = await supabase
    .from("pitch_pitcher_games")
    .select(
      "game_pk, pitch_games!inner(game_date, season, home_team_id, away_team_id)",
    )
    .eq("pitcher_id", pitcherId);

  type PitcherGameRow = {
    game_pk: number;
    pitch_games: {
      game_date: string;
      season: number;
      home_team_id: number | null;
      away_team_id: number | null;
    };
  };
  const pitcherGames = (pitcherGameRows ?? []) as unknown as PitcherGameRow[];

  const seasonsWithData = new Set<number>();
  for (const r of aggSeasonRows ?? []) seasonsWithData.add(r.season);
  for (const g of pitcherGames) seasonsWithData.add(g.pitch_games.season);
  seasonsWithData.add(currentYear);
  const availableSeasons = Array.from(seasonsWithData).sort((a, b) => b - a);

  const seasonGames = pitcherGames.filter(
    (g) => g.pitch_games.season === season,
  );
  const seasonGamePks = new Set(seasonGames.map((g) => g.game_pk));

  // Pitch-type filtering is now done in JS so the arsenal display can
  // ignore it (the type chips are how the user toggles types — they
  // can't disappear from the arsenal when one is selected).
  let pitchQuery = supabase
    .from("pitch_game_pitches")
    .select(
      "game_pk, pitch_type, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, stand, description, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension",
    )
    .eq("pitcher_id", pitcherId)
    .limit(1500);
  if (seasonGamePks.size > 0) {
    pitchQuery = pitchQuery.in("game_pk", Array.from(seasonGamePks));
  } else {
    pitchQuery = pitchQuery.eq("game_pk", -1); // empty
  }
  if (hand) pitchQuery = pitchQuery.eq("stand", hand);
  if (gamePk) pitchQuery = pitchQuery.eq("game_pk", gamePk);

  const { data: pitchesRaw } = await pitchQuery;

  // Outcome and pitch-type filtering happen in JS. Outcomes because
  // Statcast description strings don't map cleanly onto our 5-bucket
  // categorization in SQL; pitch-types because we want the arsenal
  // table/chips to reflect game+hand+outcome filters but NOT the
  // currently-selected pitch types.
  const outcomeSet = new Set(outcomes);
  const arsenalPitches = (pitchesRaw ?? []).filter(
    (p) => outcomeSet.size === 0 || outcomeSet.has(categorizeDescription(p.description)),
  );
  const pitchTypeSet = new Set(pitchTypes);
  const filteredPitches =
    pitchTypeSet.size === 0
      ? arsenalPitches
      : arsenalPitches.filter((p) => p.pitch_type != null && pitchTypeSet.has(p.pitch_type));

  // Build arsenal stats directly from the filtered pitches so counts +
  // percentages always match what's actually rendered.
  type Bucket = { count: number; sumVel: number; nVel: number };
  const buckets = new Map<string, Bucket>();
  for (const p of arsenalPitches) {
    if (!p.pitch_type) continue;
    const b = buckets.get(p.pitch_type) ?? { count: 0, sumVel: 0, nVel: 0 };
    b.count += 1;
    if (p.release_speed != null) {
      b.sumVel += p.release_speed;
      b.nVel += 1;
    }
    buckets.set(p.pitch_type, b);
  }
  const totalArsenalPitches = arsenalPitches.length;
  const aggregates: AggRow[] = Array.from(buckets.entries())
    .map(([pitch_type, b]) => ({
      pitch_type,
      pitch_count: b.count,
      usage_pct: totalArsenalPitches > 0 ? (b.count / totalArsenalPitches) * 100 : 0,
      avg_velocity: b.nVel > 0 ? b.sumVel / b.nVel : null,
    }))
    .sort((a, b) => b.pitch_count - a.pitch_count);

  // Game dropdown options (every game this pitcher pitched in this
  // season, sourced from pitch_pitcher_games).
  const teamIds = new Set<number>();
  for (const g of seasonGames) {
    if (g.pitch_games.home_team_id) teamIds.add(g.pitch_games.home_team_id);
    if (g.pitch_games.away_team_id) teamIds.add(g.pitch_games.away_team_id);
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
  const gameOptions: GameOption[] = seasonGames
    .map((g) => ({
      game_pk: g.game_pk,
      game_date: g.pitch_games.game_date,
      away: g.pitch_games.away_team_id
        ? (teamAbbr.get(g.pitch_games.away_team_id) ?? "?")
        : "?",
      home: g.pitch_games.home_team_id
        ? (teamAbbr.get(g.pitch_games.home_team_id) ?? "?")
        : "?",
    }))
    .sort((a, b) => b.game_date.localeCompare(a.game_date));

  return {
    season,
    availableSeasons,
    aggregates,
    pitches: filteredPitches as PitchRow[],
    gameOptions,
  };
}

function pitcherLabel(p: PitcherRow): string {
  if (p.last_name && p.last_name.trim().length > 0) return p.last_name;
  // Fall back to last token of full_name when last_name isn't populated.
  const parts = p.full_name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? p.full_name;
}

function parseHand(v: string | undefined): "L" | "R" | null {
  return v === "L" || v === "R" ? v : null;
}

function parseGame(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const OUTCOME_KEYS: OutcomeCategory[] = ["whiff", "called", "ball", "foul", "inplay", "other"];

function parseOutcomes(v: string | undefined): OutcomeCategory[] {
  if (!v) return [];
  const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.filter((p): p is OutcomeCategory =>
    (OUTCOME_KEYS as string[]).includes(p),
  );
}

function buildToggleQS(
  sp: Record<string, string | undefined>,
  key: string,
  value: string | null,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === key) continue;
    if (v != null) params.set(k, v);
  }
  if (value !== null) params.set(key, value);
  return params.toString();
}

interface PitcherRow {
  mlb_id: number;
  full_name: string;
  throws: string | null;
  current_team_id: number | null;
  debut_year: number | null;
  last_name: string | null;
}

interface TeamRow {
  mlb_id: number;
  name: string;
  abbreviation: string;
}

interface AggRow {
  pitch_type: string;
  pitch_count: number | null;
  usage_pct: number | null;
  avg_velocity: number | null;
}

interface PitchRow {
  pitch_type: string | null;
  release_pos_x: number | null;
  release_pos_y: number | null;
  release_pos_z: number | null;
  vx0: number | null;
  vy0: number | null;
  vz0: number | null;
  ax: number | null;
  ay: number | null;
  az: number | null;
  plate_x: number | null;
  plate_z: number | null;
  release_speed: number | null;
  stand: string | null;
  description: string | null;
  release_spin_rate: number | null;
  spin_axis: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
  release_extension: number | null;
}

interface GameOption {
  game_pk: number;
  game_date: string;
  away: string;
  home: string;
}

async function fetchTeam(
  supabase: SupabaseClient,
  teamId: number,
): Promise<TeamRow | null> {
  const { data } = await supabase
    .from("pitch_teams")
    .select("mlb_id, name, abbreviation")
    .eq("mlb_id", teamId)
    .maybeSingle();
  return (data as TeamRow | null) ?? null;
}

function PitcherCard({
  side,
  pitcher,
  team,
  season,
  aggregates,
  availableSeasons,
  games,
}: {
  side: CompareSide;
  pitcher: PitcherRow;
  team: TeamRow | null;
  season: number;
  aggregates: AggRow[];
  availableSeasons: number[];
  games: GameOption[];
}) {
  const sideLabel = side === "a" ? "Pitcher A" : "Pitcher B";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
          <Image
            src={pitcherHeadshotUrl(pitcher.mlb_id, 120)}
            alt=""
            fill
            sizes="48px"
            className="object-cover"
            unoptimized
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
            {sideLabel} · {season}
          </div>
          <div className="text-sm font-medium text-white truncate">{pitcher.full_name}</div>
          <div className="text-[11px] text-white/55 tabular-nums">
            {pitcher.throws ? `${pitcher.throws}HP` : ""}
            {team ? ` · ${team.abbreviation}` : ""}
          </div>
        </div>
        {team ? (
          <div className="relative w-9 h-9 flex-shrink-0">
            <Image
              src={teamLogoUrl(team.mlb_id)}
              alt={team.name}
              fill
              sizes="36px"
              className="object-contain"
              unoptimized
            />
          </div>
        ) : null}
      </div>
      {aggregates.length === 0 ? (
        <div className="text-xs text-white/55">No arsenal data cached for {season}.</div>
      ) : (
        <ul className="space-y-1">
          {aggregates.slice(0, 6).map((a) => (
            <li
              key={a.pitch_type}
              className="flex items-center gap-2 text-xs tabular-nums"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: getPitchColorForSide(a.pitch_type, side) }}
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
            </li>
          ))}
        </ul>
      )}
      <CompareSideFilters
        side={side}
        availableSeasons={availableSeasons}
        arsenal={aggregates.map((a) => ({
          pitch_type: a.pitch_type,
          pitch_count: a.pitch_count,
        }))}
        games={games}
      />
    </div>
  );
}

async function EmptyState({ aId, bId }: { aId: number | null; bId: number | null }) {
  const supabase = await createClient();
  const ids = [aId, bId].filter((x): x is number => x != null);
  const { data: rows } = ids.length
    ? await supabase
        .from("pitch_pitchers")
        .select("mlb_id, full_name")
        .in("mlb_id", ids)
    : { data: [] };
  const byId = new Map((rows ?? []).map((r) => [r.mlb_id, r.full_name]));

  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="space-y-2">
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors"
          >
            ← pitchtracker
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Compare two pitchers</h1>
          <p className="text-sm text-white/55">
            Pick two pitchers (or the same pitcher across seasons) to overlay their arsenals
            in shared 3D space.
          </p>
        </div>

        <CompareSlot slot="a" selectedId={aId} selectedName={aId ? byId.get(aId) : undefined} otherId={bId} />
        <CompareSlot slot="b" selectedId={bId} selectedName={bId ? byId.get(bId) : undefined} otherId={aId} />
      </div>
    </main>
  );
}

function CompareSlot({
  slot,
  selectedId,
  selectedName,
  otherId,
}: {
  slot: "a" | "b";
  selectedId: number | null;
  selectedName?: string;
  otherId: number | null;
}) {
  const slotLabel = slot === "a" ? "Pitcher A" : "Pitcher B";
  const changeHref = (() => {
    const sp = new URLSearchParams();
    if (slot === "a" && otherId) sp.set("b", String(otherId));
    if (slot === "b" && otherId) sp.set("a", String(otherId));
    const qs = sp.toString();
    return qs ? `/compare?${qs}` : "/compare";
  })();

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">{slotLabel}</div>
      {selectedId ? (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md bg-white/[0.06] border border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-9 h-9 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
              <Image
                src={pitcherHeadshotUrl(selectedId, 80)}
                alt=""
                fill
                sizes="36px"
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="text-sm text-white/95 truncate">
              {selectedName ?? `Pitcher ${selectedId}`}
            </div>
          </div>
          <Link
            href={changeHref}
            className="text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white/80 transition-colors"
          >
            Change
          </Link>
        </div>
      ) : (
        <CompareSlotSearch slot={slot} otherId={otherId} />
      )}
    </div>
  );
}
