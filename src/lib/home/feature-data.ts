import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSavantSeason } from "@/lib/cache/savant-season";
import { loadAtBatPitches } from "@/lib/cache/savant-game";
import { getCachedPitcher, getCachedTeamMap } from "@/lib/pitcher/cached-reads";
import { fetchPersonsCached } from "@/lib/statsapi/client";
import { atBatPath, pitcherPagePath } from "@/lib/url/pitcher-slug";
import { getPitchColor, getPitchLabel } from "@/lib/viz/colors";
import {
  buildArsenal,
  evenSample,
  MONITOR_SAMPLE,
  toSlimPitch,
  type FeaturedAtBat,
  type HomeFeature,
  type SlimPitch,
} from "./feature-shapes";

export * from "./feature-shapes";
import { formatShortName, getHomeRankings } from "./rankings";

// Data behind the homepage hero "monitor" and the feature cards:
// one featured pitcher (the season strikeout leader), a sample of his
// season's pitches for the 3D scene, his arsenal, and the at-bat
// behind the latest Pitch of the Day.
//
// Everything is read server-side from the cached Savant loaders, not
// the BotID-gated JSON routes, and slimmed before it reaches the
// client: a full season is ~3,000 rows × ~30 fields (~2 MB of JSON),
// while the monitor only needs trajectory fields for a sample.

async function loadFeaturedAtBat(): Promise<FeaturedAtBat | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pitch_daily_features")
    .select("game_pk, at_bat_number, pitcher_id, batter_id, game_date, feature_kind")
    .eq("feature_kind", "pitch_of_the_day")
    .order("game_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.game_pk || !data.at_bat_number) return null;

  const ids = [data.pitcher_id, data.batter_id].filter((x): x is number => x != null);
  const [rows, people] = await Promise.all([
    loadAtBatPitches(data.game_pk, data.at_bat_number),
    fetchPersonsCached(ids),
  ]);
  if (rows.length === 0) return null;

  const short = (id: number | null) => {
    const p = id ? people.get(id) : undefined;
    if (!p) return "—";
    return formatShortName({
      first_name: p.firstName ?? null,
      last_name: p.lastName ?? null,
      full_name: p.fullName,
    });
  };
  const pitcherFull = data.pitcher_id ? people.get(data.pitcher_id)?.fullName : undefined;
  const batterFull = data.batter_id ? people.get(data.batter_id)?.fullName : undefined;

  return {
    href: pitcherFull
      ? atBatPath(data.game_pk, data.at_bat_number, pitcherFull, batterFull ?? null)
      : `/at-bat/${data.game_pk}/${data.at_bat_number}`,
    pitcherShort: short(data.pitcher_id),
    batterShort: short(data.batter_id),
    date: data.game_date,
    pitches: [...rows]
      .sort((a, b) => a.pitch_number - b.pitch_number)
      .map((p, i) => ({
        n: i + 1,
        type: p.pitch_type ?? "UN",
        label: getPitchLabel(p.pitch_type ?? "UN"),
        color: getPitchColor(p.pitch_type ?? "UN"),
        mph: p.release_speed != null ? p.release_speed.toFixed(1) : "—",
        plateX: p.plate_x,
        plateZ: p.plate_z,
      })),
  };
}

// The homepage only needs a ~60 KB slice of the season. Cache that
// slice on its own: a heavy starter's full season (~2.3 MB) is over
// Next's 2 MB data-cache item limit, so loadSavantSeason's own cache
// silently fails to store it and every regeneration would otherwise
// re-read the whole season from Savant.
const getSeasonSlice = unstable_cache(
  async (pitcherId: number, season: number) => {
    const savant = await loadSavantSeason(pitcherId, season);
    const slim = savant.pitches.map(toSlimPitch).filter((p): p is SlimPitch => p !== null);
    return {
      pitchCount: savant.pitches.length,
      pitchTypeCount: savant.arsenal.length,
      monitorPitches: evenSample(slim, MONITOR_SAMPLE),
      arsenal: buildArsenal(savant.arsenal),
    };
  },
  ["home-season-slice"],
  { revalidate: 60 * 60 * 6, tags: ["savant-season"] },
);

export const getHomeFeature = cache(async (): Promise<HomeFeature | null> => {
  const { season, boards } = await getHomeRankings();
  const kLeader = boards.find((b) => b.category.key === "strikeouts")?.rows[0];
  if (!kLeader) return null;

  const [pitcher, teams, slice, atBat] = await Promise.all([
    getCachedPitcher(kLeader.pitcherId),
    getCachedTeamMap(),
    getSeasonSlice(kLeader.pitcherId, season),
    loadFeaturedAtBat().catch(() => null),
  ]);
  if (!pitcher) return null;

  return {
    season,
    pitcher: {
      id: pitcher.mlb_id,
      name: pitcher.full_name,
      shortName: formatShortName(pitcher),
      href: pitcherPagePath(pitcher.mlb_id, pitcher.full_name),
      teamAbbr: pitcher.current_team_id
        ? (teams.get(pitcher.current_team_id)?.abbreviation ?? null)
        : null,
      role: pitcher.throws ? `${pitcher.throws}HP` : null,
    },
    ...slice,
    atBat,
  };
});
