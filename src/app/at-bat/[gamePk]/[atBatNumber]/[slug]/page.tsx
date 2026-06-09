import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPerson, fetchPersonsCached } from "@/lib/statsapi/client";
import { pitcherHeadshotUrl, personHeadshotUrl } from "@/lib/viz/headshot";
import {
  atBatPath,
  atBatSlug,
  pitcherPagePath,
} from "@/lib/url/pitcher-slug";
import { TopNav } from "@/components/chrome/TopNav";
import { ensureGameCache } from "@/lib/cache/backfill";
import { eventPillColor } from "@/lib/viz/colors";
import type { ReplayPitch } from "../AtBatReplayScene";
import { AtBatOutcomeLegend } from "../AtBatOutcomeLegend";
import {
  PitcherMatchupsSidebar,
  type PitcherAbDisplay,
} from "../PitcherMatchupsSidebar";

interface PageProps {
  params: Promise<{ gamePk: string; atBatNumber: string; slug: string }>;
  searchParams: Promise<{ camera?: string; pitch?: string; event?: string }>;
}

// Resolve the canonical {pitcher-slug}-vs-{batter-slug} for an at-bat.
// Returns null when the AB doesn't exist (caller 404s) or has no
// resolvable pitcher (caller falls back to a stub URL). Cached at the
// React request scope via Supabase's per-request dedupe.
async function loadAtBatPlayers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  gamePk: number,
  atBatNumber: number,
): Promise<{ pitcherName: string | null; batterName: string | null } | null> {
  const { data: pitch } = await supabase
    .from("pitch_game_pitches")
    .select("pitcher_id, batter_id")
    .eq("game_pk", gamePk)
    .eq("at_bat_number", atBatNumber)
    .order("pitch_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!pitch) return null;
  const [pitcherRes, batterRes] = await Promise.all([
    pitch.pitcher_id
      ? supabase
          .from("pitch_pitchers")
          .select("full_name")
          .eq("mlb_id", pitch.pitcher_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    pitch.batter_id
      ? supabase
          .from("pitch_batters")
          .select("full_name")
          .eq("mlb_id", pitch.batter_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    pitcherName: pitcherRes.data?.full_name ?? null,
    batterName: batterRes.data?.full_name ?? null,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { gamePk, atBatNumber } = await params;
  const gamePkN = Number(gamePk);
  const atBatN = Number(atBatNumber);
  const ogUrl = `/api/og/at-bat?gamePk=${gamePk}&atBatNumber=${atBatNumber}`;
  if (!Number.isFinite(gamePkN) || !Number.isFinite(atBatN)) {
    return { title: `At-bat replay · pitchtracker` };
  }
  // Resolve the players so the title carries both names — the lift
  // for "Lindor at-bats vs Skenes" / "Skenes vs Lindor" queries.
  const supabase = await createClient();
  const players = await loadAtBatPlayers(supabase, gamePkN, atBatN);
  const pitcherName = players?.pitcherName ?? null;
  const batterName = players?.batterName ?? null;
  const matchupPhrase =
    pitcherName && batterName
      ? `${pitcherName} vs ${batterName}`
      : pitcherName
        ? `${pitcherName} at-bat`
        : `At-bat replay`;
  const titlePhrase = `${matchupPhrase} · At-bat #${atBatN}`;
  // Canonical URL is the slugged path so Google indexes the
  // name-bearing URL instead of the id-only fallback.
  const slugSegment = pitcherName
    ? atBatSlug(pitcherName, batterName)
    : null;
  const canonical = slugSegment
    ? `/at-bat/${gamePkN}/${atBatN}/${slugSegment}`
    : `/at-bat/${gamePkN}/${atBatN}`;
  return {
    title: titlePhrase,
    description: pitcherName
      ? `${matchupPhrase}, at-bat #${atBatN} — pitch-by-pitch 3D replay on pitchtracker.`
      : `Pitch-by-pitch 3D replay of a single at-bat.`,
    alternates: { canonical },
    openGraph: {
      title: `${titlePhrase} · pitchtracker`,
      description: "Pitch-by-pitch 3D replay of a single at-bat.",
      url: canonical,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${titlePhrase} · pitchtracker`,
      images: [ogUrl],
    },
  };
}

export default async function AtBatPage({ params, searchParams }: PageProps) {
  const { gamePk, atBatNumber, slug } = await params;
  const sp = await searchParams;

  const gamePkN = Number(gamePk);
  const atBatN = Number(atBatNumber);
  if (!Number.isFinite(gamePkN) || !Number.isFinite(atBatN)) notFound();

  const supabase = await createClient();

  // Lazy-fetch from Savant if the game's pitches aren't cached yet.
  await ensureGameCache(gamePkN);

  // Slug normalization: if the request's slug doesn't match the
  // canonical {pitcher-slug}-vs-{batter-slug} for this at-bat, 308 to
  // the right URL. Preserves search params so deep-links (?event=,
  // ?pitch=, ?camera=) survive.
  const players = await loadAtBatPlayers(supabase, gamePkN, atBatN);
  if (players?.pitcherName) {
    const canonicalSlug = atBatSlug(players.pitcherName, players.batterName);
    if (slug !== canonicalSlug) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(sp)) {
        if (typeof v === "string" && v.length > 0) qs.set(k, v);
      }
      const tail = qs.toString();
      permanentRedirect(
        `/at-bat/${gamePkN}/${atBatN}/${canonicalSlug}${tail ? `?${tail}` : ""}`,
      );
    }
  }

  const { data: pitchesRaw } = await supabase
    .from("pitch_game_pitches")
    .select(
      "game_pk, at_bat_number, pitch_number, pitcher_id, batter_id, pitch_type, description, events, balls, strikes, outs_when_up, inning, inning_topbot, stand, on_1b, on_2b, on_3b, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension",
    )
    .eq("game_pk", gamePkN)
    .eq("at_bat_number", atBatN)
    .order("pitch_number", { ascending: true });

  const pitches = (pitchesRaw ?? []) as ReplayPitch[];

  // Pull game + pitcher metadata before deciding whether to bail out, so
  // we can show a graceful empty state with the game header still intact.
  const { data: game } = await supabase
    .from("pitch_games")
    .select("game_pk, game_date, home_team_id, away_team_id, season")
    .eq("game_pk", gamePkN)
    .maybeSingle();

  if (pitches.length === 0) {
    return <NotCachedState gamePk={gamePkN} atBatNumber={atBatN} game={game} />;
  }

  const first = pitches[0];
  const pitcherId = first.pitcher_id;
  const batterId = first.batter_id;

  const teamIds = [game?.home_team_id, game?.away_team_id].filter(
    (id): id is number => typeof id === "number",
  );

  const [pitcherRes, teamRes] = await Promise.all([
    pitcherId
      ? supabase
          .from("pitch_pitchers")
          .select("mlb_id, full_name, throws, current_team_id")
          .eq("mlb_id", pitcherId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    teamIds.length > 0
      ? supabase
          .from("pitch_teams")
          .select("mlb_id, abbreviation, name")
          .in("mlb_id", teamIds)
      : Promise.resolve({ data: [] }),
  ]);

  const pitcher = pitcherRes.data;
  const teams = (teamRes.data ?? []) as Array<{
    mlb_id: number;
    abbreviation: string;
    name: string;
  }>;
  const teamById = new Map(teams.map((t) => [t.mlb_id, t]));

  // Lazy lookup for the batter (no pitch_batters table yet). Cached
  // through Next's fetch dedup; one network call per page render.
  let batterName: string | null = null;
  if (batterId) {
    try {
      const person = await fetchPerson(batterId);
      batterName = person?.fullName ?? null;
    } catch {
      // Stats API down; fall back to "Batter #<id>" in the HUD.
    }
  }

  const homeTeam = game?.home_team_id ? teamById.get(game.home_team_id) : null;
  const awayTeam = game?.away_team_id ? teamById.get(game.away_team_id) : null;

  // All of THIS pitcher's at-bats in this game — drives both the
  // prev/next pitcher-AB navigation and the full matchups selector
  // below. One row per pitch in the table; collapse to per-AB
  // buckets carrying the batter, inning, pitch count, and the final
  // event (last pitch's events string, or last description as a
  // fallback for ABs that ended without an event row populated).
  interface PitcherAB {
    at_bat_number: number;
    batter_id: number | null;
    inning: number | null;
    inning_topbot: string | null;
    pitch_count: number;
    final_events: string | null;
    final_description: string | null;
  }
  const { data: pitcherAbRowsRaw } = pitcherId
    ? await supabase
        .from("pitch_game_pitches")
        .select(
          "at_bat_number, batter_id, inning, inning_topbot, pitch_number, events, description",
        )
        .eq("game_pk", gamePkN)
        .eq("pitcher_id", pitcherId)
        .order("at_bat_number", { ascending: true })
        .order("pitch_number", { ascending: true })
    : { data: [] };
  const pitcherAbMap = new Map<number, PitcherAB>();
  for (const r of pitcherAbRowsRaw ?? []) {
    let bucket = pitcherAbMap.get(r.at_bat_number);
    if (!bucket) {
      bucket = {
        at_bat_number: r.at_bat_number,
        batter_id: r.batter_id,
        inning: r.inning,
        inning_topbot: r.inning_topbot,
        pitch_count: 0,
        final_events: null,
        final_description: null,
      };
      pitcherAbMap.set(r.at_bat_number, bucket);
    }
    bucket.pitch_count += 1;
    bucket.final_events = r.events;
    bucket.final_description = r.description;
  }
  const allPitcherAbs = Array.from(pitcherAbMap.values());

  // Resolve every batter's name in one batch (Stats API caches
  // long-term, so re-renders are cheap). The sidebar is now client-
  // side so we pass it a pre-resolved name string per AB.
  const abBatterIds = Array.from(
    new Set(
      allPitcherAbs
        .map((a) => a.batter_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  );
  const abBatterMap = abBatterIds.length
    ? await fetchPersonsCached(abBatterIds)
    : await fetchPersonsCached([]);

  // Pre-resolved sidebar rows for the client sidebar component.
  const pitcherAbDisplay: PitcherAbDisplay[] = allPitcherAbs.map((ab) => ({
    at_bat_number: ab.at_bat_number,
    batter_id: ab.batter_id,
    batter_name: ab.batter_id
      ? abBatterMap.get(ab.batter_id)?.fullName ?? `Batter #${ab.batter_id}`
      : "—",
    inning: ab.inning,
    inning_topbot: ab.inning_topbot,
    pitch_count: ab.pitch_count,
    final_events: ab.final_events,
    final_description: ab.final_description,
  }));

  // Prev/next at-bat — restricted to this pitcher's matchups so
  // stepping doesn't jump to the other team's pitcher mid-game.
  // (Server-side prev/next is unaware of the client-side `?event=`
  // filter; that's fine for v1 because the sidebar's own row links
  // are filter-aware and the buttons are mostly used in unfiltered
  // mode.)
  const pitcherAbNumbers = allPitcherAbs.map((a) => a.at_bat_number);
  const currentAbIdx = pitcherAbNumbers.indexOf(atBatN);
  const prevAb = currentAbIdx > 0 ? pitcherAbNumbers[currentAbIdx - 1] : null;
  const nextAb =
    currentAbIdx >= 0 && currentAbIdx < pitcherAbNumbers.length - 1
      ? pitcherAbNumbers[currentAbIdx + 1]
      : null;
  // Slugged Prev/Next URLs — use the resolved batter name per AB so
  // the link target carries the matchup pair, not just the id.
  function abHrefByNumber(abNumber: number): string {
    const ab = pitcherAbDisplay.find((a) => a.at_bat_number === abNumber);
    const pitcherName = pitcher?.full_name ?? "player";
    const batterName = ab?.batter_name ?? null;
    return atBatPath(gamePkN, abNumber, pitcherName, batterName);
  }

  const lastPitch = pitches[pitches.length - 1];
  const finalEvent =
    pitches
      .map((p) => p.events)
      .filter((e): e is string => typeof e === "string" && e.length > 0)
      .pop() ?? null;

  // Default to the hitter's-eye view — the strike zone sits centrally
  // The 3D scene + the camera-preset / pitch-highlight URL params
  // are owned by AtBatSceneShell (in /at-bat/[gamePk]/layout.tsx)
  // now, so the page is panel + chrome only and the WebGL Canvas
  // stays mounted across [atBatNumber] route changes.

  return (
    <>
      <TopNav
        back={{ href: `/at-bat/${gamePkN}`, label: "Game" }}
        title="At-bat replay"
      />

      <section className="absolute top-16 left-3 right-3 sm:left-6 sm:right-auto z-20 sm:w-[400px] rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg p-3 sm:p-4 pointer-events-auto max-h-[55vh] sm:max-h-[calc(100vh-17rem)] overflow-hidden flex flex-col">
        {/* Top portion stays pinned via flex-shrink-0 — only the
            matchups list below absorbs flex-1 and scrolls. */}
        <div className="flex-shrink-0 space-y-2 sm:space-y-4">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-white/75">
          <span>
            {awayTeam?.abbreviation ?? "?"} @ {homeTeam?.abbreviation ?? "?"}
          </span>
          <span>{game?.game_date ?? ""}</span>
        </div>

        {/* Pitcher + batter on a single mirrored row (desktop): pitcher
            headshot + name flush left, batter name + headshot flush
            right. Mobile keeps its own tight combined row below. */}
        <div className="hidden sm:flex sm:flex-col sm:gap-3">
          <div className="flex items-center gap-3">
            {/* Pitcher (left) */}
            {pitcher ? (
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
            ) : null}
            <div className="min-w-0 flex-1 text-left">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/70">
                Pitcher
              </div>
              {pitcher ? (
                <Link
                  href={`${pitcherPagePath(pitcher.mlb_id, pitcher.full_name)}?season=${game?.season ?? ""}&game=${gamePkN}`}
                  className="text-sm font-medium text-white truncate hover:underline underline-offset-2 decoration-white/40 block"
                >
                  {pitcher.full_name}
                </Link>
              ) : (
                <div className="text-sm font-medium text-white truncate">
                  Pitcher #{pitcherId ?? "—"}
                </div>
              )}
              <div className="text-[11px] text-white/85 tabular-nums">
                {pitcher?.throws ? `${pitcher.throws}HP` : ""}
              </div>
            </div>

            {/* Batter (right) */}
            <div className="min-w-0 flex-1 text-right">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/70">
                Batter
              </div>
              <div className="text-sm font-medium text-white truncate">
                {batterName ?? `Batter #${batterId ?? "—"}`}
              </div>
              <div className="text-[11px] text-white/85 tabular-nums">
                {first.stand ? `${first.stand}HB` : ""}
              </div>
            </div>
            {batterId ? (
              <div className="relative w-12 h-12 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
                <Image
                  src={pitcherHeadshotUrl(batterId, 120)}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : null}
          </div>

        </div>

        {/* Mobile: single tight row — pitcher | vs | batter, headshots
            shrunk to 28px and the secondary lines (throws, hand) folded
            into the name lines. Cuts ~120px of vertical chrome. */}
        <div className="flex sm:hidden items-center gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {pitcher ? (
              <div className="relative w-7 h-7 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
                <Image
                  src={pitcherHeadshotUrl(pitcher.mlb_id, 80)}
                  alt=""
                  fill
                  sizes="28px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              {pitcher ? (
                <Link
                  href={`${pitcherPagePath(pitcher.mlb_id, pitcher.full_name)}?season=${game?.season ?? ""}&game=${gamePkN}`}
                  className="text-xs font-medium text-white truncate hover:underline underline-offset-2 decoration-white/40 block"
                >
                  {pitcher.full_name}
                </Link>
              ) : (
                <div className="text-xs font-medium text-white truncate">
                  Pitcher #{pitcherId ?? "—"}
                </div>
              )}
              <div className="text-[10px] text-white/85 tabular-nums">
                {pitcher?.throws ? `${pitcher.throws}HP` : ""}
              </div>
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/55 flex-shrink-0">
            vs
          </span>
          <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
            <div className="min-w-0 flex-1 text-right">
              <div className="text-xs font-medium text-white truncate">
                {batterName ?? `Batter #${batterId ?? "—"}`}
              </div>
              <div className="text-[10px] text-white/85 tabular-nums">
                {first.stand ? `${first.stand}HB` : ""}
              </div>
            </div>
            {batterId ? (
              <div className="relative w-7 h-7 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
                <Image
                  src={pitcherHeadshotUrl(batterId, 80)}
                  alt=""
                  fill
                  sizes="28px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Prev/next at-bat navigation within the game — visible on both
            mobile and desktop so users can step through ABs without
            bouncing back to the game's at-bat list. Hidden direction(s)
            when no neighbor exists. */}
        {(prevAb !== null || nextAb !== null) ? (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.05]">
            {prevAb !== null ? (
              <Link
                href={
                  sp.event
                    ? `${abHrefByNumber(prevAb)}?event=${encodeURIComponent(sp.event)}`
                    : abHrefByNumber(prevAb)
                }
                className="px-2 py-0.5 rounded text-[10px] uppercase tracking-[0.14em] bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-white/75 hover:text-white transition-colors"
              >
                ← Prev AB
              </Link>
            ) : (
              <span />
            )}
            {nextAb !== null ? (
              <Link
                href={
                  sp.event
                    ? `${abHrefByNumber(nextAb)}?event=${encodeURIComponent(sp.event)}`
                    : abHrefByNumber(nextAb)
                }
                className="px-2 py-0.5 rounded text-[10px] uppercase tracking-[0.14em] bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-white/75 hover:text-white transition-colors"
              >
                Next AB →
              </Link>
            ) : (
              <span />
            )}
          </div>
        ) : null}

        {/* Game-state HUD: inning + pitches + outs on a single line,
            final outcome on the right; baserunner diamond on its own
            row on desktop only. */}
        <div className="pt-3 border-t border-white/[0.05] space-y-2">
          <div className="flex items-center justify-between text-[11px] tabular-nums">
            <span className="text-white/85">
              {first.inning_topbot === "Bot" ? "Bot" : "Top"} {first.inning ?? "—"} ·{" "}
              {pitches.length} pitch{pitches.length === 1 ? "" : "es"} ·{" "}
              {first.outs_when_up ?? 0}{" "}
              {(first.outs_when_up ?? 0) === 1 ? "out" : "outs"}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-white text-[10px] font-semibold uppercase tracking-[0.08em] shadow-sm ${eventPillColor(
                finalEvent,
              )}`}
            >
              {finalEvent
                ? finalEvent
                    .split("_")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ")
                : lastPitch.description ?? "—"}
            </span>
          </div>
          {/* Baserunner diamond — desktop only; eats horizontal space
              on a phone without adding much. */}
          <div className="hidden sm:flex">
            <BaserunnerDiamond
              on1b={first.on_1b != null}
              on2b={first.on_2b != null}
              on3b={first.on_3b != null}
            />
          </div>
        </div>
        </div>

        {/* Pitcher's full matchup list for this game. Rendered as a
            client component so the chip filter does shallow URL
            updates (no server re-fetch) when the current AB still
            matches, and a hard router.push to the first matching AB
            when it doesn't. */}
        <PitcherMatchupsSidebar
          gamePk={gamePkN}
          pitcherId={pitcherId}
          pitcherName={pitcher?.full_name ?? null}
          season={game?.season ?? null}
          currentAbN={atBatN}
          allPitcherAbs={pitcherAbDisplay}
        />
      </section>

      <AtBatOutcomeLegend />
    </>
  );
}

interface GameRow {
  game_pk: number;
  game_date: string;
  home_team_id: number | null;
  away_team_id: number | null;
  season: number;
}

// Compact diamond glyph — three corner dots colored when a runner is on
// that base. Reads pitch-by-pitch state without taking up real estate.
function BaserunnerDiamond({
  on1b,
  on2b,
  on3b,
}: {
  on1b: boolean;
  on2b: boolean;
  on3b: boolean;
}) {
  const onColor = "#fbbf24";
  const offColor = "rgba(255, 255, 255, 0.18)";
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      aria-label={`Runners on: ${[on1b && "1B", on2b && "2B", on3b && "3B"]
        .filter(Boolean)
        .join(", ") || "none"}`}
    >
      {/* 2B (top), 3B (left), 1B (right) — home plate is at bottom but
          omitted since the batter is the active body. */}
      <rect
        x={10}
        y={2}
        width={4}
        height={4}
        transform="rotate(45 12 4)"
        fill={on2b ? onColor : offColor}
      />
      <rect
        x={2}
        y={10}
        width={4}
        height={4}
        transform="rotate(45 4 12)"
        fill={on3b ? onColor : offColor}
      />
      <rect
        x={18}
        y={10}
        width={4}
        height={4}
        transform="rotate(45 20 12)"
        fill={on1b ? onColor : offColor}
      />
    </svg>
  );
}

function NotCachedState({
  gamePk,
  atBatNumber,
  game,
}: {
  gamePk: number;
  atBatNumber: number;
  game: GameRow | null;
}) {
  return (
    <>
      <TopNav back={{ href: "/", label: "Home" }} title="At-bat replay" />
      <div className="absolute inset-0 flex items-center justify-center px-6 pointer-events-auto">
        <div className="max-w-2xl space-y-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            At-bat not available
          </h1>
          <p className="text-sm text-white/55">
            We don&apos;t have pitch data for at-bat #{atBatNumber} of game{" "}
            {gamePk}
            {game?.game_date ? ` (${game.game_date})` : ""} yet.
          </p>
          <p className="text-sm text-white/55">
            Visit a pitcher&apos;s profile to load that season&apos;s pitches,
            or come back once the at-bat lands in the daily notable feed.
          </p>
        </div>
      </div>
    </>
  );
}
