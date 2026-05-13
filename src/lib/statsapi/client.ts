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
