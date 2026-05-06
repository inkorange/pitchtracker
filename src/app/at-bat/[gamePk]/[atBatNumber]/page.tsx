import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPerson } from "@/lib/statsapi/client";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";
import type { CameraPreset } from "@/lib/viz/camera-presets";
import { AtBatReplayScene, type ReplayPitch } from "./AtBatReplayScene";

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

  const lastPitch = pitches[pitches.length - 1];
  const finalEvent =
    pitches
      .map((p) => p.events)
      .filter((e): e is string => typeof e === "string" && e.length > 0)
      .pop() ?? null;

  const initialCamera: CameraPreset =
    sp.camera === "front" ||
    sp.camera === "back" ||
    sp.camera === "top" ||
    sp.camera === "side"
      ? sp.camera
      : "side";
  // ?pitch=N matches the AB-relative pitch_number, not an array index.
  // Resolves correctly even if Statcast records gaps in pitch_number.
  const initialPitchIdx = (() => {
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
        initialPitchIdx={initialPitchIdx}
      />

      <header className="absolute top-6 left-6 right-6 flex items-start justify-between gap-6 pointer-events-none">
        <div className="flex gap-3 items-center pointer-events-auto">
          <Link
            href="/"
            className="px-2.5 py-1 rounded bg-black/35 hover:bg-black/50 border border-white/15 text-white/85 hover:text-white text-[10px] uppercase tracking-[0.16em] transition-colors backdrop-blur-sm"
          >
            ← pitchtracker
          </Link>
          {pitcher ? (
            <Link
              href={`/pitcher/${pitcher.mlb_id}?season=${game?.season ?? ""}`}
              className="px-2.5 py-1 rounded text-[11px] uppercase tracking-[0.14em] bg-black/35 hover:bg-black/50 border border-white/15 text-white transition-colors backdrop-blur-sm"
            >
              View pitcher
            </Link>
          ) : null}
        </div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/55 pointer-events-none">
          At-bat replay
        </div>
      </header>

      <section className="absolute top-20 left-6 w-[400px] rounded-lg bg-black/50 backdrop-blur-md border border-white/10 shadow-lg p-4 space-y-4 pointer-events-auto max-h-[calc(100vh-7rem)] overflow-y-auto">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-white/45">
          <span>
            {awayTeam?.abbreviation ?? "?"} @ {homeTeam?.abbreviation ?? "?"}
          </span>
          <span>{game?.game_date ?? ""}</span>
        </div>

        {/* Pitcher card */}
        <div className="flex items-center gap-3">
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
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
              Pitcher
            </div>
            <div className="text-sm font-medium text-white truncate">
              {pitcher?.full_name ?? `Pitcher #${pitcherId ?? "—"}`}
            </div>
            <div className="text-[11px] text-white/55 tabular-nums">
              {pitcher?.throws ? `${pitcher.throws}HP` : ""}
            </div>
          </div>
          {pitcher?.current_team_id ? (
            <div className="relative w-9 h-9 flex-shrink-0">
              <Image
                src={teamLogoUrl(pitcher.current_team_id)}
                alt=""
                fill
                sizes="36px"
                className="object-contain"
                unoptimized
              />
            </div>
          ) : null}
        </div>

        {/* Batter card */}
        <div className="flex items-center gap-3 pt-3 border-t border-white/[0.08]">
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
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
              Batter
            </div>
            <div className="text-sm font-medium text-white truncate">
              {batterName ?? `Batter #${batterId ?? "—"}`}
            </div>
            <div className="text-[11px] text-white/55 tabular-nums">
              {first.stand ? `${first.stand}HB` : ""}
            </div>
          </div>
        </div>

        {/* Game-state HUD: inning, outs, runners, final outcome */}
        <div className="pt-3 border-t border-white/[0.05] space-y-2">
          <div className="flex items-center justify-between text-[11px] tabular-nums">
            <span className="text-white/55">
              {first.inning_topbot === "Bot" ? "Bot" : "Top"} {first.inning ?? "—"} ·{" "}
              {pitches.length} pitch{pitches.length === 1 ? "" : "es"}
            </span>
            <span className="text-white/85">
              {finalEvent
                ? finalEvent
                    .split("_")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ")
                : lastPitch.description ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-white/55">
            <BaserunnerDiamond
              on1b={first.on_1b != null}
              on2b={first.on_2b != null}
              on3b={first.on_3b != null}
            />
            <span className="tabular-nums normal-case text-white/65">
              {first.outs_when_up ?? 0}{" "}
              {(first.outs_when_up ?? 0) === 1 ? "out" : "outs"}
            </span>
          </div>
        </div>
      </section>
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
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href="/"
          className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors"
        >
          ← pitchtracker
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          At-bat not cached
        </h1>
        <p className="text-sm text-white/55">
          We don&apos;t have pitch data cached for at-bat #{atBatNumber} of game{" "}
          {gamePk}
          {game?.game_date ? ` (${game.game_date})` : ""} yet.
        </p>
        <p className="text-sm text-white/55">
          Visit a pitcher&apos;s profile and pick a season we&apos;ve cached, or
          come back once the at-bat lands in the daily notable feed.
        </p>
      </div>
    </main>
  );
}
