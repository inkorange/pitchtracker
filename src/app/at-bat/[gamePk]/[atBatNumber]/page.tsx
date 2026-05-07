import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPerson } from "@/lib/statsapi/client";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";
import type { CameraPreset } from "@/lib/viz/camera-presets";
import { TopNav } from "@/components/chrome/TopNav";
import { ensureGameCache } from "@/lib/cache/backfill";
import { eventPillColor } from "@/lib/viz/colors";
import { AtBatReplayScene, type ReplayPitch } from "./AtBatReplayScene";
import { AtBatOutcomeLegend } from "./AtBatOutcomeLegend";

interface PageProps {
  params: Promise<{ gamePk: string; atBatNumber: string }>;
  searchParams: Promise<{ camera?: string; pitch?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { gamePk, atBatNumber } = await params;
  const ogUrl = `/api/og/at-bat?gamePk=${gamePk}&atBatNumber=${atBatNumber}`;
  return {
    title: `At-bat replay · pitchtracker`,
    openGraph: {
      title: `At-bat replay · ${gamePk}/${atBatNumber}`,
      description: "Pitch-by-pitch 3D replay of a single at-bat.",
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: [ogUrl],
    },
  };
}

export default async function AtBatPage({ params, searchParams }: PageProps) {
  const { gamePk, atBatNumber } = await params;
  const sp = await searchParams;

  const gamePkN = Number(gamePk);
  const atBatN = Number(atBatNumber);
  if (!Number.isFinite(gamePkN) || !Number.isFinite(atBatN)) notFound();

  const supabase = await createClient();

  // Lazy-fetch from Savant if the game's pitches aren't cached yet.
  await ensureGameCache(gamePkN);

  const { data: pitchesRaw } = await supabase
    .from("pitch_game_pitches")
    .select(
      "game_pk, at_bat_number, pitch_number, pitcher_id, batter_id, pitch_type, pitch_name, description, events, balls, strikes, outs_when_up, inning, inning_topbot, stand, p_throws, on_1b, on_2b, on_3b, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension",
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

  // Prev/next at-bat in this game so the pitcher card can offer in-game
  // navigation. One row per pitch in the table; collapse to distinct
  // at_bat_numbers and find the neighbors of the current one.
  const { data: abNumbersRaw } = await supabase
    .from("pitch_game_pitches")
    .select("at_bat_number")
    .eq("game_pk", gamePkN)
    .order("at_bat_number", { ascending: true });
  const abNumbers = Array.from(
    new Set((abNumbersRaw ?? []).map((r) => r.at_bat_number)),
  );
  const currentAbIdx = abNumbers.indexOf(atBatN);
  const prevAb = currentAbIdx > 0 ? abNumbers[currentAbIdx - 1] : null;
  const nextAb =
    currentAbIdx >= 0 && currentAbIdx < abNumbers.length - 1
      ? abNumbers[currentAbIdx + 1]
      : null;

  const lastPitch = pitches[pitches.length - 1];
  const finalEvent =
    pitches
      .map((p) => p.events)
      .filter((e): e is string => typeof e === "string" && e.length > 0)
      .pop() ?? null;

  // Default to the hitter's-eye view — the strike zone sits centrally
  // in the frame on every aspect ratio, including mobile portrait
  // where the side preset's narrow horizontal FOV clipped the plate.
  // Users can still switch to side / back / top via the CameraPad.
  const initialCamera: CameraPreset =
    sp.camera === "front" ||
    sp.camera === "back" ||
    sp.camera === "top" ||
    sp.camera === "side"
      ? sp.camera
      : "front";
  // ?pitch=N highlights a specific pitch (used by the OG image link
  // and the daily-features deep link), but it should NOT skip the
  // playback past the preceding pitches — playback starts at pitch 1
  // and animates through. The highlight is a separate concern handled
  // by selectedDetailIdx in the scene component.
  const initialHighlightPitch = (() => {
    const n = Number(sp.pitch);
    if (!Number.isFinite(n)) return null;
    const idx = pitches.findIndex((p) => p.pitch_number === n);
    return idx === -1 ? null : idx;
  })();

  return (
    <main className="fixed inset-0 bg-[#0a0e14] overflow-hidden">
      <AtBatReplayScene
        pitches={pitches}
        initialCamera={initialCamera}
        initialHighlightIdx={initialHighlightPitch}
      />

      <TopNav
        back={{ href: `/at-bat/${gamePkN}`, label: "Game" }}
        title="At-bat replay"
      />

      <section className="absolute top-16 left-3 right-3 sm:left-6 sm:right-auto z-20 sm:w-[400px] rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg p-3 sm:p-4 space-y-2 sm:space-y-4 pointer-events-auto h-[11rem] sm:h-auto sm:max-h-[calc(100vh-7rem)] overflow-y-auto">
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
                  href={`/pitcher/${pitcher.mlb_id}?season=${game?.season ?? ""}`}
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
                  href={`/pitcher/${pitcher.mlb_id}?season=${game?.season ?? ""}`}
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
                href={`/at-bat/${gamePkN}/${prevAb}`}
                className="px-2 py-0.5 rounded text-[10px] uppercase tracking-[0.14em] bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-white/75 hover:text-white transition-colors"
              >
                ← Prev AB
              </Link>
            ) : (
              <span />
            )}
            {nextAb !== null ? (
              <Link
                href={`/at-bat/${gamePkN}/${nextAb}`}
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

      </section>

      <AtBatOutcomeLegend />
    </main>
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
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 pt-20 pb-12">
      <TopNav back={{ href: "/", label: "Home" }} title="At-bat replay" />
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">
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
    </main>
  );
}
