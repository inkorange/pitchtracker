import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchGameResultByPk,
  fetchPersonsCached,
  type MlbGameResult,
} from "@/lib/statsapi/client";
import { teamLogoUrl, pitcherHeadshotUrl } from "@/lib/viz/headshot";
import { TopNav } from "@/components/chrome/TopNav";
import { ensureGameCache } from "@/lib/cache/backfill";
import { AtBatGameList, type AtBatDisplay } from "./AtBatGameList";

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

  // Lazy-fetch from Savant if we haven't cached this game yet. The
  // team+date lookup can route here for any scheduled game; we want
  // every such landing to "just work" rather than dead-end on an
  // empty stub. ensureGameCache no-ops once data is present.
  await ensureGameCache(gamePkN);

  // Box score lookup from MLB Stats. Best-effort — if the API is
  // down we just skip rendering the box-score panel. The hydrated
  // schedule response is cached 10 min by fetchGameResultByPk.
  let gameResult: MlbGameResult | null = null;
  try {
    gameResult = await fetchGameResultByPk(gamePkN);
  } catch {
    gameResult = null;
  }

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

  const allAtBats = Array.from(byAb.values()).sort(
    (a, b) => a.at_bat_number - b.at_bat_number,
  );

  // Resolve player names. Pitchers are in our table; batters require an
  // MLB Stats API roundtrip but the response is cached aggressively.
  const pitcherIds = Array.from(
    new Set(allAtBats.map((a) => a.pitcher_id).filter((id): id is number => id != null)),
  );
  const batterIds = Array.from(
    new Set(allAtBats.map((a) => a.batter_id).filter((id): id is number => id != null)),
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

  // Pre-resolve display strings on the server so the client list can
  // re-filter without re-fetching MLB Stats / Supabase data.
  const allAtBatsDisplay: AtBatDisplay[] = allAtBats.map((ab) => ({
    at_bat_number: ab.at_bat_number,
    pitch_count: ab.pitch_count,
    inning: ab.inning,
    inning_topbot: ab.inning_topbot,
    pitcher_id: ab.pitcher_id,
    batter_id: ab.batter_id,
    pitcher_name: ab.pitcher_id
      ? pitcherById.get(ab.pitcher_id)?.lastName ?? `Pitcher #${ab.pitcher_id}`
      : "—",
    batter_name: ab.batter_id
      ? batterMap.get(ab.batter_id)?.fullName ?? `Batter #${ab.batter_id}`
      : "—",
    outs_when_up: ab.outs_when_up,
    final_balls: ab.final_balls,
    final_strikes: ab.final_strikes,
    events: ab.events,
    last_description: ab.last_description,
  }));

  // Schema.org markup so Google can render this page as a sports
  // event rich result (date, teams, venue). BreadcrumbList helps the
  // SERP show the back-path. Both are inlined as application/ld+json
  // because we want them in the initial HTML, not appended later.
  const eventJsonLd = game
    ? {
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        name: `${awayTeam?.name ?? "Away"} @ ${homeTeam?.name ?? "Home"}`,
        startDate: game.game_date,
        eventStatus: "https://schema.org/EventScheduled",
        sport: "Baseball",
        homeTeam: homeTeam
          ? { "@type": "SportsTeam", name: homeTeam.name }
          : undefined,
        awayTeam: awayTeam
          ? { "@type": "SportsTeam", name: awayTeam.name }
          : undefined,
        url: `/at-bat/${gamePkN}`,
      }
    : null;
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Games", item: "/at-bat" },
      {
        "@type": "ListItem",
        position: 3,
        name: game?.game_date ?? `Game ${gamePkN}`,
        item: `/at-bat/${gamePkN}`,
      },
    ],
  };

  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 pt-20 pb-12">
      {eventJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <TopNav back={{ href: "/at-bat", label: "All games" }} title="Game" />
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="space-y-2">
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
        </div>

        {gameResult ? (
          <BoxScore
            result={gameResult}
            awayAbbr={awayTeam?.abbreviation ?? "?"}
            homeAbbr={homeTeam?.abbreviation ?? "?"}
          />
        ) : null}

        <AtBatGameList
          gamePk={gamePkN}
          allAtBats={allAtBatsDisplay}
          totalPitches={pitches.length}
        />
      </div>
    </main>
  );
}

// =====================================================================
// Box score — R / H / E per team plus W / L / SV decisions.
// Sourced from MLB Stats (linescore + decisions hydrate).
// =====================================================================
function BoxScore({
  result,
  awayAbbr,
  homeAbbr,
}: {
  result: MlbGameResult;
  awayAbbr: string;
  homeAbbr: string;
}) {
  const awayScore = result.away.score;
  const homeScore = result.home.score;
  const awayWon =
    awayScore != null && homeScore != null && awayScore > homeScore;
  const homeWon =
    awayScore != null && homeScore != null && homeScore > awayScore;
  const hasDecisions =
    result.decisions.winner ||
    result.decisions.loser ||
    result.decisions.save;
  return (
    <section className="rounded-lg bg-white/[0.04] border border-white/10 px-4 py-3">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1 text-sm tabular-nums items-baseline">
        <span />
        <span className="text-[10px] uppercase tracking-[0.16em] text-white/45 text-right">R</span>
        <span className="text-[10px] uppercase tracking-[0.16em] text-white/45 text-right">H</span>
        <span className="text-[10px] uppercase tracking-[0.16em] text-white/45 text-right">E</span>
        <BoxScoreTeamRow
          teamId={result.away.teamId}
          abbr={awayAbbr}
          line={result.away}
          won={awayWon}
        />
        <BoxScoreTeamRow
          teamId={result.home.teamId}
          abbr={homeAbbr}
          line={result.home}
          won={homeWon}
        />
      </div>
      {hasDecisions ? (
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] tabular-nums">
          {result.decisions.winner ? (
            <BoxDecision tag="W" color="text-emerald-300/90" name={result.decisions.winner.fullName} />
          ) : null}
          {result.decisions.loser ? (
            <BoxDecision tag="L" color="text-red-300/90" name={result.decisions.loser.fullName} />
          ) : null}
          {result.decisions.save ? (
            <BoxDecision tag="SV" color="text-amber-300/90" name={result.decisions.save.fullName} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function BoxScoreTeamRow({
  teamId,
  abbr,
  line,
  won,
}: {
  teamId: number;
  abbr: string;
  line: MlbGameResult["home"];
  won: boolean;
}) {
  const dim = "text-white/65";
  const bold = "text-white font-semibold";
  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative w-6 h-6 flex-shrink-0">
          <Image
            src={teamLogoUrl(teamId)}
            alt=""
            fill
            sizes="24px"
            className="object-contain"
            unoptimized
          />
        </div>
        <span className={won ? bold : "text-white/85"}>{abbr}</span>
      </div>
      <span className={`text-right ${won ? bold : dim}`}>
        {line.score ?? "—"}
      </span>
      <span className={`text-right ${dim}`}>{line.hits ?? "—"}</span>
      <span className={`text-right ${dim}`}>{line.errors ?? "—"}</span>
    </>
  );
}

function BoxDecision({
  tag,
  color,
  name,
}: {
  tag: string;
  color: string;
  name: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`${color} font-semibold uppercase tracking-[0.08em]`}>
        {tag}
      </span>
      <span className="text-white/90">{shortPitcherName(name)}</span>
    </span>
  );
}

// "Garrett Crochet" → "G. Crochet" so the decisions row stays narrow.
function shortPitcherName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function NotCachedState({ gamePk }: { gamePk: number }) {
  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 pt-20 pb-12">
      <TopNav back={{ href: "/at-bat", label: "All games" }} title="Game" />
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">No pitches for this game</h1>
        <p className="text-sm text-white/55">
          Game {gamePk} doesn&apos;t have any pitch data yet. Try loading
          a pitcher who appeared in this game from their profile page.
        </p>
      </div>
    </main>
  );
}
