import { getHomeRankings } from "@/lib/home/rankings";
import { getPastSeasonBoards, PAST_MIN_PITCHES } from "@/lib/leaderboards/history";
import { LeaderboardSeasons, type SeasonBoards } from "./LeaderboardSeasons";

// Leaderboards — design/Main.dc.html "LEADERS" + HomeMobile, plus a
// season dropdown. The current season shows all six boards from our own
// rankings; past seasons show only the boards external sources can
// supply (strikeouts, four-seam velocity and spin — see
// lib/leaderboards/history.ts). Every season is loaded here (cached) so
// switching is instant and the homepage stays statically rendered.
const PAST_SEASONS = 4;

export async function Leaderboards() {
  const { season, boards } = await getHomeRankings();
  if (boards.length === 0) return null;

  const past = await Promise.all(
    Array.from({ length: PAST_SEASONS }, (_, i) => season - 1 - i).map(async (s) => ({
      season: s,
      boards: await getPastSeasonBoards(s).catch(() => []),
    })),
  );
  const seasons: SeasonBoards[] = [
    { season, boards, note: null },
    ...past
      .filter((p) => p.boards.length > 0)
      .map((p) => ({
        ...p,
        note: `Past seasons show strikeouts (MLB) plus four-seam velocity and spin from Baseball Savant (pitchers with ${PAST_MIN_PITCHES}+ pitches). Whiff, CSW and approach-angle boards are current-season only.`,
      })),
  ];

  return <LeaderboardSeasons seasons={seasons} />;
}
