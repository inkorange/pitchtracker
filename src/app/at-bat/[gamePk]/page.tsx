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
import { TeamLogo } from "@/components/team/TeamLogo";
import { teamNickname } from "@/lib/teams/nicknames";
import { absoluteUrl } from "@/lib/url/site";
import { lookupVenueLocation } from "@/lib/seo/venue-locations";
import { TopNav } from "@/components/chrome/TopNav";
import { AtBatGameList, type AtBatDisplay } from "./AtBatGameList";
import { loadGamePitches } from "@/lib/cache/savant-game";

interface PageProps {
  params: Promise<{ gamePk: string }>;
}

// ISR: pre-render the page's HTML per-URL and regenerate in the
// background at most once per hour. Game-level pitch data is
// frozen after the game ends, so a bot enumerating game IDs (or
// Googlebot crawling the sitemap + internal links) hits static
// HTML from the edge cache — the DB is only touched on the first
// request per URL per hour per region. Combined with the CDN
// s-maxage in next.config.ts, this is what killed the ~117K
// pitch_game_pitches SELECTs we saw in pg_stat_statements
// during the disk-IO audit.
export const revalidate = 3600;

// Format a YYYY-MM-DD game_date to a human month/day/year phrase for
// titles + descriptions. Parses in UTC so a date like "2026-05-15"
// doesn't shift by one when the server is in a west-of-UTC timezone.
function formatGameDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { gamePk } = await params;
  const gamePkN = Number(gamePk);
  const canonical = `/at-bat/${gamePk}`;
  if (!Number.isFinite(gamePkN)) {
    return { title: "Game · PitchTracker", alternates: { canonical } };
  }
  // Fetch the game + both team names so the title carries the actual
  // matchup and date ("Yankees @ Red Sox · May 15, 2026") instead of
  // the numeric gamePk ("Game 823932"). The pitch_games row is cheap
  // and cached, and teams are a small dimension table — worst case
  // this adds two round-trips to metadata generation. Falls back to
  // the numeric ID if either lookup fails, so a stale/unsynced game
  // still gets a valid page.
  const supabase = await createClient();
  const { data: game } = await supabase
    .from("pitch_games")
    .select("game_date, home_team_id, away_team_id")
    .eq("game_pk", gamePkN)
    .maybeSingle();
  const homeId = game?.home_team_id ?? null;
  const awayId = game?.away_team_id ?? null;
  const teamIds = [homeId, awayId].filter((v): v is number => typeof v === "number");
  const { data: teams } =
    teamIds.length > 0
      ? await supabase
          .from("pitch_teams")
          .select("mlb_id, name")
          .in("mlb_id", teamIds)
      : { data: [] as Array<{ mlb_id: number; name: string }> };
  const teamById = new Map((teams ?? []).map((t) => [t.mlb_id, t.name]));
  const awayName = awayId != null ? teamById.get(awayId) ?? null : null;
  const homeName = homeId != null ? teamById.get(homeId) ?? null : null;
  const dateLabel = formatGameDate(game?.game_date ?? null);
  const matchup =
    awayName && homeName ? `${awayName} @ ${homeName}` : null;
  const title = matchup
    ? dateLabel
      ? `${matchup} · ${dateLabel} · PitchTracker`
      : `${matchup} · PitchTracker`
    : `Game #${gamePkN} · PitchTracker`;
  const description = matchup
    ? `${matchup}${dateLabel ? ` on ${dateLabel}` : ""} — box score plus pitch-by-pitch 3D at-bat replays on PitchTracker.`
    : `Every at-bat from this MLB game, with pitch-by-pitch 3D replays on PitchTracker.`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
    },
    twitter: { card: "summary", title, description },
  };
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

  // No lazy backfill: this page reads from the cached per-game Savant
  // read-through and never touches pitch_game_pitches, so there is
  // nothing to populate first. The write-through this replaced was part
  // of the pitch upsert that accounts for 48% of the database's WAL.

  // Box score lookup from MLB Stats. Best-effort — if the API is
  // down we just skip rendering the box-score panel. The hydrated
  // schedule response is cached 10 min by fetchGameResultByPk.
  let gameResult: MlbGameResult | null = null;
  try {
    gameResult = await fetchGameResultByPk(gamePkN);
  } catch {
    gameResult = null;
  }

  // Schedule metadata stays in Postgres (pitch_games is 2 MB); the
  // pitches come from the cached per-game Savant read.
  const [{ data: game }, gamePitches] = await Promise.all([
    supabase
      .from("pitch_games")
      .select("game_pk, game_date, home_team_id, away_team_id, season, status")
      .eq("game_pk", gamePkN)
      .maybeSingle(),
    loadGamePitches(gamePkN),
  ]);

  const pitches = gamePitches as unknown as PitchSummaryRow[];

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
    // Full name kept separately for URL construction — AtBatGameList
    // passes this to atBatPath() so the emitted link matches the
    // canonical slug the [slug] route computes from full_name.
    pitcher_full_name: ab.pitcher_id
      ? pitcherById.get(ab.pitcher_id)?.fullName ?? null
      : null,
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
  //
  // Search Console flagged this block for "Missing field location"
  // (critical) plus missing performer / endDate / organizer /
  // description. The critical one was literal: no `location` was
  // emitted at all, and Google rejects an Event whose Place has no
  // address, so these pages were ineligible for the rich result they
  // were marked up for in the first place.
  //
  // Venue and status both come from the live schedule response rather
  // than pitch_games, which is not trustworthy for either: the lazy
  // Savant backfill stub-inserts game rows with status "Scheduled" and
  // a null venue, and only refresh-games (last 30 days) ever enriches
  // them — so ~3,000 historical rows still carry both stubs. The
  // schedule response is authoritative for any game MLB knows about.
  //
  // Two fields stay absent on purpose:
  //   - `offers`: these are archival replay pages for games already
  //     played. No tickets are on sale, and fabricating an offer to
  //     satisfy a validator would be false markup.
  //   - `performer` is filled with the two clubs, which is the honest
  //     reading for a team sport; there is no individual headliner.
  //
  // The whole block is gated on resolving a venue address and both
  // team names. An Event with an incomplete location is strictly worse
  // than no Event: it becomes a crawl error rather than simply failing
  // to earn a rich result.
  const venueLocation = lookupVenueLocation(gameResult?.venue.id);
  const venueName = gameResult?.venue.name ?? null;
  // Prefer the live team names, falling back to our teams table.
  const homeName = gameResult?.home.teamName ?? homeTeam?.name ?? null;
  const awayName = gameResult?.away.teamName ?? awayTeam?.name ?? null;

  // schema.org's EventStatusType has no "completed" member — the
  // enumeration is Scheduled / Cancelled / Postponed / Rescheduled /
  // MovedOnline. EventScheduled is therefore correct for a game that
  // was played, and the only real win here is labelling the games that
  // never happened, which the previous hardcoded value got wrong.
  const detailedState = gameResult?.status.detailedState ?? game?.status ?? "";
  const eventStatus = /cancel/i.test(detailedState)
    ? "https://schema.org/EventCancelled"
    : /postpone/i.test(detailedState)
      ? "https://schema.org/EventPostponed"
      : "https://schema.org/EventScheduled";

  const eventJsonLd =
    game && venueLocation && venueName && homeName && awayName
      ? {
          "@context": "https://schema.org",
          "@type": "SportsEvent",
          name: `${awayName} @ ${homeName}`,
          description:
            `Pitch-by-pitch 3D replay of every at-bat from ${awayName} at ` +
            `${homeName} on ${game.game_date}, played at ${venueName}.`,
          // Date-only precision: pitch_games stores the official
          // baseball day, not first pitch. endDate matches startDate
          // because a game resolves within its official date.
          startDate: game.game_date,
          endDate: game.game_date,
          eventStatus,
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          sport: "Baseball",
          location: {
            "@type": "Place",
            name: venueName,
            address: {
              "@type": "PostalAddress",
              addressLocality: venueLocation.city,
              ...(venueLocation.region
                ? { addressRegion: venueLocation.region }
                : {}),
              addressCountry: venueLocation.country,
            },
          },
          organizer: {
            "@type": "SportsOrganization",
            name: "Major League Baseball",
            url: "https://www.mlb.com",
          },
          performer: [
            { "@type": "SportsTeam", name: awayName },
            { "@type": "SportsTeam", name: homeName },
          ],
          homeTeam: { "@type": "SportsTeam", name: homeName },
          awayTeam: { "@type": "SportsTeam", name: awayName },
          url: absoluteUrl(`/at-bat/${gamePkN}`),
        }
      : null;
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      {
        "@type": "ListItem",
        position: 2,
        name: "Games",
        item: absoluteUrl("/at-bat"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: game?.game_date ?? `Game ${gamePkN}`,
        item: absoluteUrl(`/at-bat/${gamePkN}`),
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
                <TeamLogo teamId={awayTeam.mlb_id} size={36} alt={awayTeam.name} />
              ) : null}
              <span>{awayTeam ? teamNickname(awayTeam.mlb_id) : "?"}</span>
              <span className="text-white/45 text-base">@</span>
              {homeTeam?.mlb_id ? (
                <TeamLogo teamId={homeTeam.mlb_id} size={36} alt={homeTeam.name} />
              ) : null}
              <span>{homeTeam ? teamNickname(homeTeam.mlb_id) : "?"}</span>
            </h1>
            <span className="text-sm text-white/55 tabular-nums">
              {game?.game_date}
            </span>
          </div>
        </div>

        {gameResult ? <BoxScore result={gameResult} /> : null}

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
function BoxScore({ result }: { result: MlbGameResult }) {
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
          line={result.away}
          won={awayWon}
        />
        <BoxScoreTeamRow
          teamId={result.home.teamId}
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
  line,
  won,
}: {
  teamId: number;
  line: MlbGameResult["home"];
  won: boolean;
}) {
  const dim = "text-white/65";
  const bold = "text-white font-semibold";
  return (
    <>
      <div className="flex items-center gap-2">
        <TeamLogo teamId={teamId} size={24} />
        <span className={won ? bold : "text-white/85"}>{teamNickname(teamId)}</span>
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
