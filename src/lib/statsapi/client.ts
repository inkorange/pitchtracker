// Typed client for the MLB Stats API (statsapi.mlb.com). Free, public,
// no authentication. Used for everything except pitch tracking data.

const BASE = "https://statsapi.mlb.com/api/v1";

export interface MlbTeam {
  id: number;
  name: string;
  abbreviation: string;
  league: string; // "American League" | "National League"
  division: string; // "American League East" etc.
}

export interface MlbPlayer {
  id: number;
  fullName: string;
  firstName?: string;
  lastName?: string;
  primaryPosition?: { code: string; abbreviation: string };
  pitchHand?: { code: string }; // "L" | "R"
  batSide?: { code: string }; // "L" | "R" | "S" (switch)
  mlbDebutDate?: string;
  active?: boolean;
}

export interface MlbScheduleGame {
  gamePk: number;
  // First-pitch UTC timestamp. Note: late-evening games in the
  // West / Central time zones can roll past midnight UTC, so the
  // date portion of this is NOT the canonical baseball day —
  // prefer `officialDate` for that.
  gameDate: string;
  // YYYY-MM-DD string in MLB's own canonical baseball-day timezone.
  // This is the field every baseball-day-based UI/query should use.
  officialDate?: string;
  // Single-letter code: R, S, E, F, D, L, W, A. Used to filter out
  // spring training / exhibition games at the schedule layer.
  gameType?: string;
  status: { abstractGameState: string; detailedState: string };
  teams: {
    home: { team: { id: number; name: string } };
    away: { team: { id: number; name: string } };
  };
  venue?: { name?: string };
}

interface RawTeamsResponse {
  teams: Array<{
    id: number;
    name: string;
    abbreviation: string;
    league?: { name?: string };
    division?: { name?: string };
    sport?: { id: number };
    active?: boolean;
  }>;
}

interface RawRosterResponse {
  roster: Array<{
    person: { id: number; fullName: string };
    position?: { code: string; abbreviation: string };
    jerseyNumber?: string;
  }>;
}

interface RawPersonResponse {
  people: Array<{
    id: number;
    fullName: string;
    firstName?: string;
    lastName?: string;
    primaryPosition?: { code: string; abbreviation: string };
    pitchHand?: { code: string };
    batSide?: { code: string };
    mlbDebutDate?: string;
    active?: boolean;
  }>;
}

interface RawScheduleResponse {
  dates: Array<{
    date: string;
    games: MlbScheduleGame[];
  }>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "pitchtracker/0.1 (+https://github.com/inkorange/pitchtracker)",
      ...(init?.headers ?? {}),
    },
    cache: init?.cache ?? "no-store",
  });
  if (!res.ok) {
    throw new Error(`MLB Stats API ${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as T;
}

// Fetch all 30 MLB teams. sportId=1 is MLB (vs minors, college, etc.).
export async function fetchTeams(): Promise<MlbTeam[]> {
  const data = await fetchJson<RawTeamsResponse>(`${BASE}/teams?sportId=1`);
  return data.teams
    .filter((t) => t.active !== false && t.sport?.id === 1)
    .map((t) => ({
      id: t.id,
      name: t.name,
      abbreviation: t.abbreviation,
      league: t.league?.name ?? "Unknown",
      division: t.division?.name ?? "Unknown",
    }));
}

// Fetch the full-season pitching roster for a team and season. Uses
// rosterType=fullSeason to include mid-season movers.
export async function fetchTeamPitchers(
  teamId: number,
  season: number,
): Promise<Array<{ id: number; fullName: string }>> {
  const data = await fetchJson<RawRosterResponse>(
    `${BASE}/teams/${teamId}/roster?rosterType=fullSeason&season=${season}`,
  );
  // Position code "1" = pitcher, "Y" = two-way player (TWP). Both
  // throw real pitches we can render — Ohtani is classified TWP, so
  // filtering on "1" alone silently drops him from the search index.
  return data.roster
    .filter((entry) => {
      const code = entry.position?.code;
      return code === "1" || code === "Y";
    })
    .map((entry) => ({ id: entry.person.id, fullName: entry.person.fullName }));
}

// Fetch the full-season position-player roster for a team and season.
// Mirrors fetchTeamPitchers but inverts the position filter: everyone
// except "1" (pitcher) counts as a batter. Two-way players ("Y") are
// included in both lists, so e.g. Ohtani resolves from either index.
export async function fetchTeamBatters(
  teamId: number,
  season: number,
): Promise<Array<{ id: number; fullName: string }>> {
  const data = await fetchJson<RawRosterResponse>(
    `${BASE}/teams/${teamId}/roster?rosterType=fullSeason&season=${season}`,
  );
  return data.roster
    .filter((entry) => {
      const code = entry.position?.code;
      // Drop pitchers (1). Keep two-way (Y) and every position-player
      // code (2=C, 3=1B, ... 10=DH, etc.).
      return code !== "1";
    })
    .map((entry) => ({ id: entry.person.id, fullName: entry.person.fullName }));
}

// Fetch detail for a single player (handedness, debut, etc.).
export async function fetchPerson(playerId: number): Promise<MlbPlayer | null> {
  const data = await fetchJson<RawPersonResponse>(`${BASE}/people/${playerId}`);
  const person = data.people[0];
  if (!person) return null;
  return {
    id: person.id,
    fullName: person.fullName,
    firstName: person.firstName,
    lastName: person.lastName,
    primaryPosition: person.primaryPosition,
    pitchHand: person.pitchHand,
    batSide: person.batSide,
    mlbDebutDate: person.mlbDebutDate,
    active: person.active,
  };
}

// Batch fetch detail for many players via /people?personIds=...
// Long-cached because player names rarely change. Used for the at-bat
// browser which needs ~25 distinct batter names per game.
export async function fetchPersonsCached(
  playerIds: number[],
): Promise<Map<number, MlbPlayer>> {
  const result = new Map<number, MlbPlayer>();
  if (playerIds.length === 0) return result;

  const dedup = Array.from(new Set(playerIds));
  const CHUNK = 50;
  for (let i = 0; i < dedup.length; i += CHUNK) {
    const chunk = dedup.slice(i, i + CHUNK);
    try {
      const data = await fetchJson<RawPersonResponse>(
        `${BASE}/people?personIds=${chunk.join(",")}`,
        { cache: "force-cache" },
      );
      for (const p of data.people) {
        result.set(p.id, {
          id: p.id,
          fullName: p.fullName,
          firstName: p.firstName,
          lastName: p.lastName,
          primaryPosition: p.primaryPosition,
          pitchHand: p.pitchHand,
          batSide: p.batSide,
          mlbDebutDate: p.mlbDebutDate,
          active: p.active,
        });
      }
    } catch {
      // Skip the chunk on failure — partial data is better than none.
    }
  }
  return result;
}

// One pitcher's pitching line from a game's boxscore — the same numbers
// you'd see on MLB.com or ESPN. Returned from the canonical
// /game/{gamePk}/boxscore endpoint so figures match the league record
// exactly (rather than computing IP / ER ourselves from pitch data,
// which would diverge on edge cases like inherited runners).
export interface MlbPitcherGameLine {
  pitcherId: number;
  fullName: string;
  inningsPitched: string; // "6.2" — Statcast's text-encoded outs
  hits: number;
  homeRuns: number;
  runs: number;
  earnedRuns: number;
  strikeouts: number;
  baseOnBalls: number;
  numberOfPitches: number;
  strikes: number;
  battersFaced: number;
  decision: "W" | "L" | "S" | "H" | "ND";
  noteRaw: string | null; // e.g. "(W, 3-1)" — useful when you want season W-L
}

interface RawBoxscorePitchingLine {
  inningsPitched?: string;
  hits?: number;
  homeRuns?: number;
  runs?: number;
  earnedRuns?: number;
  strikeOuts?: number;
  baseOnBalls?: number;
  numberOfPitches?: number;
  strikes?: number;
  battersFaced?: number;
  note?: string;
}

interface RawBoxscorePlayer {
  person: { id: number; fullName: string };
  stats?: { pitching?: RawBoxscorePitchingLine };
}

interface RawBoxscoreResponse {
  teams: {
    home: { players: Record<string, RawBoxscorePlayer> };
    away: { players: Record<string, RawBoxscorePlayer> };
  };
}

export async function fetchPitcherGameLine(
  gamePk: number,
  pitcherId: number,
): Promise<MlbPitcherGameLine | null> {
  // Past-game boxscores are immutable, but we don't have a cheap way
  // to tell from the request whether the game is finished — so cap at
  // an hour to let live games update. Plenty fast on cache hits.
  const data = await fetchJson<RawBoxscoreResponse>(
    `${BASE}/game/${gamePk}/boxscore`,
    { next: { revalidate: 3600 }, cache: undefined },
  );
  const key = `ID${pitcherId}`;
  const player = data.teams.home.players[key] ?? data.teams.away.players[key];
  if (!player) return null;
  const p = player.stats?.pitching;
  if (!p) return null;

  // The note field, when present, encodes the W/L/S/H decision —
  // "(W, 3-1)", "(L, 0-2)", "(S, 12)", "(H, 4)". Anything else is ND.
  const note = (p.note ?? "").trim();
  let decision: MlbPitcherGameLine["decision"] = "ND";
  if (note.length > 0) {
    const ch = note.replace(/^\(/, "").charAt(0).toUpperCase();
    if (ch === "W" || ch === "L" || ch === "S" || ch === "H") decision = ch;
  }

  return {
    pitcherId,
    fullName: player.person.fullName,
    inningsPitched: p.inningsPitched ?? "0.0",
    hits: p.hits ?? 0,
    homeRuns: p.homeRuns ?? 0,
    runs: p.runs ?? 0,
    earnedRuns: p.earnedRuns ?? 0,
    strikeouts: p.strikeOuts ?? 0,
    baseOnBalls: p.baseOnBalls ?? 0,
    numberOfPitches: p.numberOfPitches ?? 0,
    strikes: p.strikes ?? 0,
    battersFaced: p.battersFaced ?? 0,
    decision,
    noteRaw: note || null,
  };
}

// Fetch the schedule between two dates inclusive. ISO YYYY-MM-DD strings.
export async function fetchSchedule(
  startDate: string,
  endDate: string,
): Promise<MlbScheduleGame[]> {
  const data = await fetchJson<RawScheduleResponse>(
    `${BASE}/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}`,
  );
  return data.dates.flatMap((d) => d.games);
}

// =====================================================================
// Hydrated schedule fetch — scores + W/L/SV decisions for one day.
// Used by the homepage "Yesterday's games" strip.
// =====================================================================

export interface MlbDecisionPlayer {
  id: number;
  fullName: string;
}

export interface MlbTeamLine {
  teamId: number;
  teamName: string;
  score: number | null;
  hits: number | null;
  errors: number | null;
}

export interface MlbGameResult {
  gamePk: number;
  officialDate: string;
  gameType: string;
  status: { abstractGameState: string; detailedState: string };
  home: MlbTeamLine;
  away: MlbTeamLine;
  decisions: {
    winner: MlbDecisionPlayer | null;
    loser: MlbDecisionPlayer | null;
    save: MlbDecisionPlayer | null;
  };
}

interface RawHydratedScheduleResponse {
  dates: Array<{
    date: string;
    games: Array<{
      gamePk: number;
      officialDate?: string;
      gameType?: string;
      status: { abstractGameState: string; detailedState: string };
      teams: {
        home: { team: { id: number; name: string }; score?: number };
        away: { team: { id: number; name: string }; score?: number };
      };
      linescore?: {
        teams?: {
          home?: { runs?: number; hits?: number; errors?: number };
          away?: { runs?: number; hits?: number; errors?: number };
        };
      };
      decisions?: {
        winner?: MlbDecisionPlayer;
        loser?: MlbDecisionPlayer;
        save?: MlbDecisionPlayer;
      };
    }>;
  }>;
}

/**
 * Fetch every game on a single official baseball day (YYYY-MM-DD in
 * MLB's canonical timezone), hydrated with linescore + decisions so
 * we can render final scores and W/L/SV pitchers without N round
 * trips. Bypasses the project-wide `cache: "no-store"` because once a
 * game is Final its decisions don't change — a 10-minute revalidate
 * is fine and keeps the homepage fast.
 */
export async function fetchGameResults(date: string): Promise<MlbGameResult[]> {
  const url = `${BASE}/schedule?sportId=1&date=${date}&hydrate=linescore,decisions`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "pitchtracker/0.1 (+https://github.com/inkorange/pitchtracker)",
    },
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    throw new Error(`MLB Stats API ${res.status} ${res.statusText} for ${url}`);
  }
  const data = (await res.json()) as RawHydratedScheduleResponse;
  const out: MlbGameResult[] = [];
  for (const d of data.dates) {
    for (const g of d.games) {
      out.push(parseHydratedGame(g, d.date));
    }
  }
  return out;
}

type RawHydratedGame = RawHydratedScheduleResponse["dates"][number]["games"][number];

function parseHydratedGame(g: RawHydratedGame, fallbackDate: string): MlbGameResult {
  const homeScore =
    g.teams.home.score ?? g.linescore?.teams?.home?.runs ?? null;
  const awayScore =
    g.teams.away.score ?? g.linescore?.teams?.away?.runs ?? null;
  const homeHits = g.linescore?.teams?.home?.hits ?? null;
  const awayHits = g.linescore?.teams?.away?.hits ?? null;
  const homeErrors = g.linescore?.teams?.home?.errors ?? null;
  const awayErrors = g.linescore?.teams?.away?.errors ?? null;
  return {
    gamePk: g.gamePk,
    officialDate: g.officialDate ?? fallbackDate,
    gameType: g.gameType ?? "R",
    status: g.status,
    home: {
      teamId: g.teams.home.team.id,
      teamName: g.teams.home.team.name,
      score: typeof homeScore === "number" ? homeScore : null,
      hits: typeof homeHits === "number" ? homeHits : null,
      errors: typeof homeErrors === "number" ? homeErrors : null,
    },
    away: {
      teamId: g.teams.away.team.id,
      teamName: g.teams.away.team.name,
      score: typeof awayScore === "number" ? awayScore : null,
      hits: typeof awayHits === "number" ? awayHits : null,
      errors: typeof awayErrors === "number" ? awayErrors : null,
    },
    decisions: {
      winner: g.decisions?.winner ?? null,
      loser: g.decisions?.loser ?? null,
      save: g.decisions?.save ?? null,
    },
  };
}

/**
 * Fetch the linescore + decisions for a single game by gamePk. Used
 * by /at-bat/[gamePk] to render the box score above the at-bat list.
 * Cached 10 minutes — once a game is Final the data is immutable, so
 * the brief staleness only matters during late-finishing games.
 */
export async function fetchGameResultByPk(
  gamePk: number,
): Promise<MlbGameResult | null> {
  const url = `${BASE}/schedule?sportId=1&gamePk=${gamePk}&hydrate=linescore,decisions`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "pitchtracker/0.1 (+https://github.com/inkorange/pitchtracker)",
    },
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    throw new Error(`MLB Stats API ${res.status} ${res.statusText} for ${url}`);
  }
  const data = (await res.json()) as RawHydratedScheduleResponse;
  for (const d of data.dates) {
    for (const g of d.games) {
      if (g.gamePk === gamePk) return parseHydratedGame(g, d.date);
    }
  }
  return null;
}
