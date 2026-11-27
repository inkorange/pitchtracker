import { unstable_cache } from "next/cache";
import { loadSavantSeason } from "@/lib/cache/savant-season";
import { getCachedPitcher, getCachedTeamMap } from "@/lib/pitcher/cached-reads";
import { fetchPersonsCached } from "@/lib/statsapi/client";
import { groupPlateAppearances, type PlateAppearance } from "./plate-appearances";

// Every plate appearance for one pitcher in one season, for the
// /at-bat matchup finder.
//
// Cached as its own small slice (~800 PAs × a few fields for a heavy
// starter): the full Savant season can exceed Next's 2 MB data-cache
// item limit, in which case loadSavantSeason's own cache silently fails
// and every request would re-read the whole season from Savant.

export interface SeasonPAs {
  pas: PlateAppearance[];
  /** gamePk → "MIL @ TB" */
  gameLabels: Record<number, string>;
}

export const getPitcherSeasonPAs = unstable_cache(
  async (pitcherId: number, season: number): Promise<SeasonPAs> => {
    const [savant, teams] = await Promise.all([loadSavantSeason(pitcherId, season), getCachedTeamMap()]);
    const pas = groupPlateAppearances(
      savant.pitches.map((p) => ({
        game_pk: p.game_pk,
        at_bat_number: p.at_bat_number,
        pitch_number: p.pitch_number,
        pitch_type: p.pitch_type,
        batter_id: p.batter_id,
        description: p.description,
        events: p.events,
        inning: p.inning,
        inning_topbot: p.inning_topbot,
        game_date: p.pitch_games?.game_date ?? null,
      })),
    );
    const abbr = (id: number | null) => (id ? (teams.get(id)?.abbreviation ?? "?") : "?");
    const gameLabels: Record<number, string> = {};
    for (const g of savant.games) {
      gameLabels[g.game_pk] = `${abbr(g.away_team_id)} @ ${abbr(g.home_team_id)}`;
    }
    return { pas, gameLabels };
  },
  ["pitcher-season-pas-v1"],
  { revalidate: 60 * 60 * 6, tags: ["savant-season"] },
);

export interface MatchupQuery {
  pitcherId: number;
  batterId: number | null;
  seasons: number[];
}

export interface MatchupResult {
  pitcher: { id: number; name: string; hand: string | null; team: string | null };
  batter: { id: number; name: string } | null;
  pas: (PlateAppearance & { season: number; game: string; batterName: string })[];
}

export async function loadMatchup(q: MatchupQuery): Promise<MatchupResult | null> {
  const [pitcher, teams, ...seasonData] = await Promise.all([
    getCachedPitcher(q.pitcherId),
    getCachedTeamMap(),
    ...q.seasons.map((s) => getPitcherSeasonPAs(q.pitcherId, s)),
  ]);
  if (!pitcher) return null;

  const pas = seasonData.flatMap((d, i) =>
    d.pas
      .filter((pa) => q.batterId == null || pa.batterId === q.batterId)
      .map((pa) => ({ ...pa, season: q.seasons[i], game: d.gameLabels[pa.gamePk] ?? "" })),
  );
  pas.sort(
    (a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.gamePk - a.gamePk || b.atBat - a.atBat,
  );

  const people = await fetchPersonsCached([
    ...(q.batterId ? [q.batterId] : []),
    ...new Set(pas.map((p) => p.batterId)),
  ]);
  const nameOf = (id: number) => people.get(id)?.fullName ?? `#${id}`;

  return {
    pitcher: {
      id: pitcher.mlb_id,
      name: pitcher.full_name,
      hand: pitcher.throws,
      team: pitcher.current_team_id ? (teams.get(pitcher.current_team_id)?.abbreviation ?? null) : null,
    },
    batter: q.batterId ? { id: q.batterId, name: nameOf(q.batterId) } : null,
    pas: pas.map((p) => ({ ...p, batterName: nameOf(p.batterId) })),
  };
}
