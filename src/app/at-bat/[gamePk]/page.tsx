import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPersonsCached } from "@/lib/statsapi/client";
import { teamLogoUrl, pitcherHeadshotUrl } from "@/lib/viz/headshot";
import { categorizeDescription, OUTCOME_COLORS } from "@/lib/viz/colors";

interface PageProps {
  params: Promise<{ gamePk: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { gamePk } = await params;
  return { title: `Game ${gamePk} · pitchtracker` };
}

interface PitchSummaryRow {
  game_pk: number;
  at_bat_number: number;
  pitch_number: number;
  pitcher_id: number | null;
  batter_id: number | null;
  inning: number | null;
  inning_topbot: string | null;
  outs_when_up: number | null;
  balls: number | null;
  strikes: number | null;
  description: string | null;
  events: string | null;
  pitch_type: string | null;
}

interface AtBatSummary {
  at_bat_number: number;
  pitch_count: number;
  inning: number;
  inning_topbot: "Top" | "Bot";
  pitcher_id: number | null;
  batter_id: number | null;
  outs_when_up: number;
  final_balls: number;
  final_strikes: number;
  events: string | null;
  last_description: string | null;
}

export default async function GameAtBatsPage({ params }: PageProps) {
  const { gamePk } = await params;
  const gamePkN = Number(gamePk);
  if (!Number.isFinite(gamePkN)) notFound();

  const supabase = await createClient();

  const [{ data: game }, { data: pitchesRaw }] = await Promise.all([
    supabase
      .from("pitch_games")
      .select("game_pk, game_date, home_team_id, away_team_id, season")
      .eq("game_pk", gamePkN)
      .maybeSingle(),
    supabase
      .from("pitch_game_pitches")
      .select(
        "game_pk, at_bat_number, pitch_number, pitcher_id, batter_id, inning, inning_topbot, outs_when_up, balls, strikes, description, events, pitch_type",
      )
      .eq("game_pk", gamePkN)
      .order("at_bat_number", { ascending: true })
      .order("pitch_number", { ascending: true })
      .range(0, 4999),
  ]);

  const pitches = (pitchesRaw ?? []) as PitchSummaryRow[];

  if (pitches.length === 0) {
    return <NotCachedState gamePk={gamePkN} />;
  }

  // Bucket pitches into at-bats. Last pitch in each AB carries the
  // final outcome (events) when present.
  const byAb = new Map<number, AtBatSummary>();
  for (const p of pitches) {
    let ab = byAb.get(p.at_bat_number);
    if (!ab) {
      ab = {
        at_bat_number: p.at_bat_number,
        pitch_count: 0,
        inning: p.inning ?? 0,
        inning_topbot: p.inning_topbot === "Bot" ? "Bot" : "Top",
        pitcher_id: p.pitcher_id,
        batter_id: p.batter_id,
        outs_when_up: p.outs_when_up ?? 0,
        final_balls: 0,
        final_strikes: 0,
        events: null,
        last_description: null,
      };
      byAb.set(p.at_bat_number, ab);
    }
    ab.pitch_count += 1;
    ab.final_balls = p.balls ?? ab.final_balls;
    ab.final_strikes = p.strikes ?? ab.final_strikes;
    if (p.events && p.events.length > 0) ab.events = p.events;
    if (p.description) ab.last_description = p.description;
  }

  const atBats = Array.from(byAb.values()).sort(
    (a, b) => a.at_bat_number - b.at_bat_number,
  );

  // Resolve player names. Pitchers are in our table; batters require an
  // MLB Stats API roundtrip but the response is cached aggressively.
  const pitcherIds = Array.from(
    new Set(atBats.map((a) => a.pitcher_id).filter((id): id is number => id != null)),
  );
  const batterIds = Array.from(
    new Set(atBats.map((a) => a.batter_id).filter((id): id is number => id != null)),
  );

  const [{ data: pitchersRaw }, batterMap, { data: teamsRaw }] = await Promise.all([
    pitcherIds.length > 0
      ? supabase
          .from("pitch_pitchers")
          .select("mlb_id, full_name, last_name")
          .in("mlb_id", pitcherIds)
      : Promise.resolve({ data: [] }),
    fetchPersonsCached(batterIds),
    game?.home_team_id || game?.away_team_id
      ? supabase
          .from("pitch_teams")
          .select("mlb_id, abbreviation, name")
          .in(
            "mlb_id",
            [game?.home_team_id, game?.away_team_id].filter(
              (id): id is number => typeof id === "number",
            ),
          )
      : Promise.resolve({ data: [] }),
  ]);

  const pitcherById = new Map(
    (pitchersRaw ?? []).map((p) => [
      p.mlb_id,
      { fullName: p.full_name, lastName: p.last_name ?? p.full_name },
    ]),
  );
  const teamById = new Map((teamsRaw ?? []).map((t) => [t.mlb_id, t]));
  const homeTeam = game?.home_team_id ? teamById.get(game.home_team_id) : null;
  const awayTeam = game?.away_team_id ? teamById.get(game.away_team_id) : null;

  // Group at-bats by half-inning so the page reads chronologically and
  // the user can scan inning-by-inning the way they'd watch a game.
  const groups: Array<{
    key: string;
    inning: number;
    half: "Top" | "Bot";
    atBats: AtBatSummary[];
  }> = [];
  for (const ab of atBats) {
    const key = `${ab.inning}-${ab.inning_topbot}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, inning: ab.inning, half: ab.inning_topbot, atBats: [] };
      groups.push(g);
    }
    g.atBats.push(ab);
  }

  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 py-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="space-y-2">
          <Link
            href="/at-bat"
            className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors"
          >
            ← All games
          </Link>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
              {awayTeam?.mlb_id ? (
                <div className="relative w-9 h-9">
                  <Image
                    src={teamLogoUrl(awayTeam.mlb_id)}
                    alt={awayTeam.name}
                    fill
                    sizes="36px"
                    className="object-contain"
                    unoptimized
                  />
                </div>
              ) : null}
              <span>{awayTeam?.abbreviation ?? "?"}</span>
              <span className="text-white/45 text-base">@</span>
              {homeTeam?.mlb_id ? (
                <div className="relative w-9 h-9">
                  <Image
                    src={teamLogoUrl(homeTeam.mlb_id)}
                    alt={homeTeam.name}
                    fill
                    sizes="36px"
                    className="object-contain"
                    unoptimized
                  />
                </div>
              ) : null}
              <span>{homeTeam?.abbreviation ?? "?"}</span>
            </h1>
            <span className="text-sm text-white/55 tabular-nums">
              {game?.game_date}
            </span>
          </div>
          <p className="text-[11px] text-white/45 tabular-nums">
            {atBats.length} at-bats · {pitches.length} pitches cached
          </p>
        </div>

        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} className="space-y-2">
              <h2 className="text-[10px] uppercase tracking-[0.18em] text-white/45 sticky top-0 bg-[#0a0e14]/95 backdrop-blur-sm py-1">
                {g.half} {g.inning}
              </h2>
              <ul className="grid grid-cols-1 gap-1.5">
                {g.atBats.map((ab) => (
                  <AtBatRow
                    key={ab.at_bat_number}
                    gamePk={gamePkN}
                    ab={ab}
                    pitcherName={
                      ab.pitcher_id
                        ? pitcherById.get(ab.pitcher_id)?.lastName ??
                          `Pitcher #${ab.pitcher_id}`
                        : "—"
                    }
                    batterName={
                      ab.batter_id
                        ? batterMap.get(ab.batter_id)?.fullName ??
                          `Batter #${ab.batter_id}`
                        : "—"
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

function AtBatRow({
  gamePk,
  ab,
  pitcherName,
  batterName,
}: {
  gamePk: number;
  ab: AtBatSummary;
  pitcherName: string;
  batterName: string;
}) {
  const cat = categorizeDescription(ab.last_description);
  const dotColor = OUTCOME_COLORS[cat];
  const outcome = formatEvent(ab.events) ?? "In progress";
  return (
    <li>
      <Link
        href={`/at-bat/${gamePk}/${ab.at_bat_number}`}
        className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          {ab.batter_id ? (
            <div className="relative w-8 h-8 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
              <Image
                src={pitcherHeadshotUrl(ab.batter_id, 60)}
                alt=""
                fill
                sizes="32px"
                className="object-cover"
                unoptimized
              />
            </div>
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="text-sm text-white/95 truncate">
            {pitcherName}{" "}
            <span className="text-white/40">vs</span> {batterName}
          </div>
          <div className="text-[11px] text-white/55 tabular-nums">
            AB #{ab.at_bat_number} · {ab.pitch_count} pitch
            {ab.pitch_count === 1 ? "" : "es"} · final{" "}
            {ab.final_balls}-{ab.final_strikes} · {ab.outs_when_up}{" "}
            {ab.outs_when_up === 1 ? "out" : "outs"}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: dotColor }}
            aria-hidden
          />
          <span className="text-white/85 truncate max-w-[10rem]">{outcome}</span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
          Replay →
        </span>
      </Link>
    </li>
  );
}

function formatEvent(events: string | null): string | null {
  if (!events || events.length === 0) return null;
  return events
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function NotCachedState({ gamePk }: { gamePk: number }) {
  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href="/at-bat"
          className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors"
        >
          ← All games
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">No pitches cached for this game</h1>
        <p className="text-sm text-white/55">
          Game {gamePk} doesn&apos;t have any pitches in our cache yet.
          Caching happens on first visit to a pitcher × season — try
          loading a pitcher who appeared in this game.
        </p>
      </div>
    </main>
  );
}
