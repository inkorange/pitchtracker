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
  mlbDebutDate?: string;
  active?: boolean;
}

export interface MlbScheduleGame {
  gamePk: number;
  gameDate: string;
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
  return data.roster
    .filter((entry) => entry.position?.code === "1") // pitchers only
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
    mlbDebutDate: person.mlbDebutDate,
    active: person.active,
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
