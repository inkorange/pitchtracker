import type { Metadata } from "next";
import Link from "next/link";
import { EyebrowTag } from "@/components/broadcast";
import { ScoreBug } from "@/components/broadcast/ScoreBug";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { GameCard } from "@/components/games/GameCard";
import { createClient } from "@/lib/supabase/server";
import { fetchGameResults, fetchPersonsCached, type MlbGameResult } from "@/lib/statsapi/client";
import { getCachedDisplaySeason } from "@/lib/pitcher/cached-reads";
import { COMPETITIVE_GAME_TYPES } from "@/lib/season/current-season";
import { loadMatchup, type MatchupResult } from "@/lib/at-bat/matchups";
import { eventLabel, eventTone, summarize } from "@/lib/at-bat/plate-appearances";
import { formatShortName } from "@/lib/home/rankings";
import { atBatPath } from "@/lib/url/pitcher-slug";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import { MatchupForm, type Picked } from "./MatchupForm";

export const metadata: Metadata = {
  title: "At-bat replay · PitchTracker",
  description:
    "Replay any MLB plate appearance pitch by pitch in 3D. Find every at-bat between a pitcher and a batter, or browse a game day.",
  alternates: { canonical: "/at-bat" },
};

// At-bat replays — design/AtBatReplays.dc.html.
// Tabs: Matchup (default; ?p=&b=&season=) | By game date (?tab=date).

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    p?: string;
    b?: string;
    season?: string;
    n?: string;
    error?: string;
    team?: string;
    date?: string;
  }>;
}

const PAGE = 50;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const toId = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);

export default async function AtBatIndex({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = sp.tab === "date" ? "date" : "matchup";
  const displaySeason = await getCachedDisplaySeason();
  const seasons = [displaySeason, displaySeason - 1];

  return (
    <main className="min-h-screen bg-bg text-ink">
      <SiteHeader active="at-bat" />
      <section className="container-page pt-6 pb-4 md:pt-12 md:pb-6 flex flex-col gap-3 md:gap-3.5">
        <EyebrowTag className="self-start">At-bat replays</EyebrowTag>
        <h1 className="m-0 font-display font-extrabold italic uppercase text-[46px] md:text-[64px] leading-[0.92]">
          Replay any matchup.
        </h1>
        <p className="m-0 text-base md:text-[17px] leading-[1.55] text-ink-2 max-w-[680px]">
          Pick a pitcher and a batter to see every plate appearance between them, then step through
          each one pitch by pitch in 3D. Or browse a game day.
        </p>
      </section>

      <section className="container-page pb-16 flex flex-col gap-4 md:gap-[18px]">
        <nav aria-label="Find at-bats by" className="self-start flex bg-surface border border-line rounded-control p-1">
          {(
            [
              ["matchup", "Matchup", "/at-bat"],
              ["date", "By game date", "/at-bat?tab=date"],
            ] as const
          ).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              aria-current={tab === key ? "page" : undefined}
              className={`h-[42px] px-[18px] flex items-center rounded-[3px] text-sm ${
                tab === key ? "bg-ink text-bg font-bold hover:text-bg" : "text-ink-2 font-semibold hover:text-ink"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {tab === "matchup" ? <MatchupTab sp={sp} seasons={seasons} /> : <DateTab sp={sp} />}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------
// Matchup tab
// ---------------------------------------------------------------------

async function MatchupTab({
  sp,
  seasons,
}: {
  sp: Awaited<PageProps["searchParams"]>;
  seasons: number[];
}) {
  const pitcherId = toId(sp.p);
  const batterId = toId(sp.b);
  const seasonParam = toId(sp.season);
  const querySeasons = seasonParam && seasons.includes(seasonParam) ? [seasonParam] : seasons;
  const shown = Math.max(PAGE, toId(sp.n) ?? PAGE);

  const [result, suggestions] = await Promise.all([
    pitcherId ? loadMatchup({ pitcherId, batterId, seasons: querySeasons }) : Promise.resolve(null),
    getSuggestions(),
  ]);

  const initialPitcher: Picked | null = result
    ? { id: result.pitcher.id, name: result.pitcher.name, meta: pitcherMeta(result) }
    : null;
  const initialBatter: Picked | null = result?.batter ? { id: result.batter.id, name: result.batter.name } : null;

  return (
    <>
      <MatchupForm
        // Remount when the URL's matchup changes (e.g. a suggestion chip).
        key={`${pitcherId}-${batterId}-${seasonParam}`}
        initialPitcher={initialPitcher}
        initialBatter={initialBatter}
        initialSeason={seasonParam ? String(seasonParam) : "all"}
        seasons={seasons}
      />
      <div className="flex gap-2 items-center flex-wrap text-[13px] text-muted">
        Leave batter empty to see everyone he faced
        {suggestions.length ? <span aria-hidden="true">· Try:</span> : null}
        {suggestions.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="h-11 md:h-8 px-3 flex items-center rounded-full border border-line-strong text-ink-2 hover:text-ink hover:border-ink-2"
          >
            {s.label}
          </Link>
        ))}
      </div>

      {pitcherId && !result ? <p className="text-muted">We couldn’t find that pitcher.</p> : null}
      {result ? <MatchupResults result={result} shown={shown} sp={sp} /> : null}
    </>
  );
}

function pitcherMeta(r: MatchupResult) {
  return [r.pitcher.team, r.pitcher.hand ? `${r.pitcher.hand}HP` : null].filter(Boolean).join(" · ");
}

function MatchupResults({
  result,
  shown,
  sp,
}: {
  result: MatchupResult;
  shown: number;
  sp: Awaited<PageProps["searchParams"]>;
}) {
  const s = summarize(result.pas);
  const shortP = formatShortName({
    first_name: result.pitcher.name.split(" ")[0],
    last_name: result.pitcher.name.split(" ").slice(1).join(" "),
    full_name: result.pitcher.name,
  });
  const strip: [string, string][] = [
    ["PA", String(s.pa)],
    ["AB", String(s.ab)],
    ["H", String(s.h)],
    ["K", String(s.k)],
    ["BB", String(s.bb)],
    ["Pitches", s.pitches.toLocaleString()],
    ["Whiff%", s.whiffPct != null ? s.whiffPct.toFixed(1) : "—"],
  ];
  const visible = result.pas.slice(0, shown);
  const more = new URLSearchParams(
    Object.entries({ p: sp.p, b: sp.b, season: sp.season, n: String(shown + PAGE) }).filter(
      (e): e is [string, string] => Boolean(e[1]),
    ),
  );
  const showBatter = result.batter == null;

  return (
    <section aria-label="Matchup results" className="flex flex-col gap-3 md:gap-4 pt-2">
      <ScoreBug
        size="md"
        className="self-start flex-wrap"
        label={`${result.pitcher.name} versus ${result.batter?.name ?? "every batter faced"}`}
        segments={[
          { tone: "team", content: shortP },
          { tone: "tag", content: "VS" },
          { tone: "name", content: result.batter ? shortBatter(result.batter.name) : "Everyone" },
        ]}
      />
      <dl className="m-0 grid grid-cols-4 md:grid-cols-7 bg-surface border border-line rounded-control">
        {strip.map(([k, v]) => (
          <div key={k} className="px-3.5 py-3 border-r border-b md:border-b-0 border-line flex flex-col min-w-0">
            <dt className="label-caps">{k}</dt>
            <dd className="m-0 font-display font-bold text-[26px] md:text-[30px] leading-[1.05] num">{v}</dd>
          </div>
        ))}
      </dl>

      {result.pas.length === 0 ? (
        <p className="text-muted">No plate appearances found for this matchup.</p>
      ) : (
        <div className="bg-surface border border-line rounded-control overflow-hidden">
          <div
            aria-hidden="true"
            className={`hidden md:grid ${showBatter ? "grid-cols-[110px_110px_minmax(0,1fr)_56px_minmax(0,1.4fr)_150px_110px]" : "grid-cols-[120px_130px_64px_minmax(0,1fr)_160px_110px]"} gap-3 px-[18px] py-3 bg-surface-2 label-caps`}
          >
            <span>Date</span>
            <span>Game</span>
            {showBatter ? <span>Batter</span> : null}
            <span>Inn</span>
            <span>Pitch sequence</span>
            <span>Result</span>
            <span />
          </div>
          <ol className="list-none m-0 p-0">
            {visible.map((pa) => {
              const href = atBatPath(pa.gamePk, pa.atBat, result.pitcher.name, pa.batterName);
              const tone = eventTone(pa.event);
              return (
                <li key={`${pa.gamePk}-${pa.atBat}`} className="border-t border-line first:border-t-0 md:first:border-t">
                  <Link
                    href={href}
                    className={`grid grid-cols-[1fr_auto] md:items-center gap-x-3 gap-y-1.5 px-4 md:px-[18px] py-3 md:py-0 md:min-h-14 text-sm text-ink hover:text-ink hover:bg-surface-2/60 ${
                      showBatter
                        ? "md:grid-cols-[110px_110px_minmax(0,1fr)_56px_minmax(0,1.4fr)_150px_110px]"
                        : "md:grid-cols-[120px_130px_64px_minmax(0,1fr)_160px_110px]"
                    }`}
                  >
                    <span className="text-ink-2 max-md:text-xs max-md:text-muted">
                      {shortDate(pa.date)}
                      <span className="md:hidden">
                        {" · "}
                        {pa.game} · {pa.half === "Bot" ? "B" : "T"}
                        {pa.inning}
                      </span>
                    </span>
                    <span className="hidden md:block font-display font-bold text-lg">{pa.game}</span>
                    {showBatter ? <span className="max-md:hidden truncate font-semibold">{pa.batterName}</span> : null}
                    <span className="hidden md:block text-muted num">
                      {pa.half === "Bot" ? "B" : "T"}
                      {pa.inning}
                    </span>
                    <span className="max-md:col-span-2 max-md:row-start-2 flex gap-1 items-center flex-wrap" role="img" aria-label={`${pa.sequence.length} pitches: ${pa.sequence.map(getPitchLabel).join(", ")}; final count ${pa.count}`}>
                      {pa.sequence.map((t, i) => (
                        <span key={i} className="size-3 rounded-full" style={{ background: getPitchColor(t) }} />
                      ))}
                      <span className="ml-2 text-xs text-muted num">
                        {pa.sequence.length} {pa.sequence.length === 1 ? "pitch" : "pitches"} · {pa.count}
                      </span>
                    </span>
                    <span
                      className={`max-md:row-start-1 max-md:col-start-2 max-md:justify-self-end font-display font-bold text-lg ${
                        tone === "pitcher" ? "text-ink" : tone === "batter" ? "text-highlight" : "text-ink-2"
                      }`}
                    >
                      {showBatter ? <span className="md:hidden font-sans font-semibold text-sm text-ink mr-2">{pa.batterName} ·</span> : null}
                      {/* No terminating event: he left mid-PA (pitching change). */}
                      {pa.event ? eventLabel(pa.event) : "Unfinished"}
                    </span>
                    <span className="hidden md:flex justify-self-end h-9 px-3.5 rounded-control bg-accent text-white text-[13px] font-bold items-center">
                      Replay ▶
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {result.pas.length > shown ? (
        <Link
          href={`/at-bat?${more}`}
          scroll={false}
          className="self-center h-11 px-5 flex items-center rounded-control border border-line-strong text-ink text-sm font-semibold hover:border-ink-2"
        >
          Show {Math.min(PAGE, result.pas.length - shown)} more of {result.pas.length.toLocaleString()}
        </Link>
      ) : null}
    </section>
  );
}

function shortBatter(full: string) {
  const parts = full.split(" ");
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : full;
}

/** Recent Pitch/Whiff-of-the-day matchups — real pairings that exist. */
async function getSuggestions(): Promise<{ label: string; href: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pitch_daily_features")
    .select("pitcher_id, batter_id, game_date")
    .order("game_date", { ascending: false })
    .limit(12);
  const pairs: { p: number; b: number }[] = [];
  for (const r of data ?? []) {
    if (!r.pitcher_id || !r.batter_id) continue;
    if (pairs.some((x) => x.p === r.pitcher_id && x.b === r.batter_id)) continue;
    pairs.push({ p: r.pitcher_id, b: r.batter_id });
    if (pairs.length === 3) break;
  }
  if (pairs.length === 0) return [];
  const people = await fetchPersonsCached(pairs.flatMap((x) => [x.p, x.b]));
  const last = (id: number) => people.get(id)?.lastName ?? people.get(id)?.fullName ?? `#${id}`;
  return pairs.map((x) => ({ label: `${last(x.p)} vs ${last(x.b)}`, href: `/at-bat?p=${x.p}&b=${x.b}` }));
}

// ---------------------------------------------------------------------
// By game date tab
// ---------------------------------------------------------------------

async function DateTab({ sp }: { sp: Awaited<PageProps["searchParams"]> }) {
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [{ data: teamsRaw }, { data: lastGame }] = await Promise.all([
    supabase.from("pitch_teams").select("mlb_id, abbreviation, name").order("name"),
    // Off-season default: the last date with a competitive game, not
    // "yesterday" (which would be empty for months).
    supabase
      .from("pitch_games")
      .select("game_date")
      .in("game_type", [...COMPETITIVE_GAME_TYPES])
      // Finished games only: pitch_games keeps "if necessary" postseason
      // games MLB later dropped from the schedule (e.g. a WS Game 7).
      .in("status", ["Final", "Game Over", "Completed Early"])
      .lt("game_date", today)
      .order("game_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const teams = teamsRaw ?? [];
  const defaultDate = lastGame?.game_date ?? today;
  const queryDate = sp.date ?? defaultDate;
  const teamFilter = toId(sp.team);

  let games: MlbGameResult[] = [];
  try {
    const all = await fetchGameResults(queryDate);
    games = all
      .filter((g) => (COMPETITIVE_GAME_TYPES as readonly string[]).includes(g.gameType))
      .filter((g) => teamFilter == null || g.home.teamId === teamFilter || g.away.teamId === teamFilter)
      .sort((a, b) => a.gamePk - b.gamePk);
  } catch {
    games = [];
  }

  const errorMessage =
    sp.error === "notfound"
      ? `${teams.find((t) => String(t.mlb_id) === sp.team)?.name ?? "That team"} didn’t play on ${sp.date ?? "that date"}.`
      : sp.error === "missing"
        ? "Pick a date to find a game."
        : null;

  return (
    <>
      {/* Plain GET form: /at-bat/lookup resolves team + date to a game. */}
      <form
        action="/at-bat/lookup"
        method="get"
        className="flex gap-3 items-end flex-wrap p-4 md:p-5 bg-surface border border-line border-t-[3px] border-t-accent rounded-control"
      >
        <label className="flex flex-col gap-2">
          <span className="label-caps">Date</span>
          <input
            name="date"
            type="date"
            required
            defaultValue={queryDate}
            className="h-[52px] px-3 rounded-control border border-line-strong bg-bg-raised text-ink text-[15px] num [color-scheme:dark]"
          />
        </label>
        <label className="flex flex-col gap-2 flex-[0_1_280px] min-w-[200px]">
          <span className="label-caps">Team (optional)</span>
          <select
            name="team"
            defaultValue={sp.team ?? ""}
            className="select-chevron h-[52px] pl-3 rounded-control border border-line-strong bg-bg-raised text-ink text-[15px]"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.mlb_id} value={t.mlb_id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-[52px] px-[22px] rounded-control bg-accent hover:bg-accent-hover text-white font-display font-bold text-xl tracking-[1px] uppercase"
        >
          Find games
        </button>
        {!sp.date && lastGame ? (
          <span className="grow text-[13px] text-muted md:pb-4">
            Showing the last day with games ({shortDate(defaultDate)}).
          </span>
        ) : null}
      </form>
      {errorMessage ? <p className="text-[13px] text-highlight">{errorMessage}</p> : null}

      <h2 className="m-0 mt-2 font-display font-extrabold text-[28px] md:text-[32px] uppercase tracking-[0.5px]">
        Games · {shortDate(queryDate)}
      </h2>
      {games.length === 0 ? (
        <p className="text-muted">No games on {shortDate(queryDate)}.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {games.map((g) => (
            <GameCard key={g.gamePk} game={g} />
          ))}
        </div>
      )}
    </>
  );
}
