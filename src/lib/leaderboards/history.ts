import { unstable_cache } from "next/cache";
import { fetchPersonsCached } from "@/lib/statsapi/client";
import { pitcherPagePath } from "@/lib/url/pitcher-slug";
import { formatShortName, RANKING_CATEGORIES, type RankingBoard } from "@/lib/home/rankings";
import { fetchStrikeoutLeaders } from "./external";
import { topFromArsenalCsv } from "./history-shapes";

// Leaderboards for past seasons, from external sources only — our own
// pitch table no longer holds past seasons, so the pitch_rankings
// categories that need every pitch (whiff%, CSW%, flat VAA) can't be
// rebuilt. What external sources do cover:
//   - Strikeouts: MLB Stats API leaders endpoint
//   - Four-seam velocity and spin: Baseball Savant's yearly
//     pitch-arsenals leaderboard (pitchers with 250+ pitches)
// Savant's qualifying rule differs from ours (8 four-seamers/week), so
// a few names can differ from what our own board would have shown.

const SAVANT = "https://baseballsavant.mlb.com/leaderboard/pitch-arsenals";
const UA = "pitchtracker/0.1 (+https://github.com/inkorange/pitchtracker)";
const TOP = 5;
/** Savant's minimum total pitches for the arsenal leaderboard. */
export const PAST_MIN_PITCHES = 250;

async function savantArsenalCsv(season: number, type: "avg_speed" | "avg_spin"): Promise<string> {
  const res = await fetch(`${SAVANT}?year=${season}&min=${PAST_MIN_PITCHES}&type=${type}&hand=&csv=true`, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Savant ${res.status} for ${type} ${season}`);
  return res.text();
}

const category = (key: string) => RANKING_CATEGORIES.find((c) => c.key === key)!;

/** Boards (strikeouts, velo, spin) for a finished season. Cached a day. */
export const getPastSeasonBoards = unstable_cache(
  async (season: number): Promise<RankingBoard[]> => {
    const [k, speedCsv, spinCsv] = await Promise.all([
      fetchStrikeoutLeaders({ season, limit: TOP }),
      savantArsenalCsv(season, "avg_speed").catch(() => ""),
      savantArsenalCsv(season, "avg_spin").catch(() => ""),
    ]);

    const boards: RankingBoard[] = [];
    const arsenalBoard = (key: string, csv: string, column: string, precision: number) => {
      const rows = csv ? topFromArsenalCsv(csv, column, TOP) : [];
      if (!rows.length) return;
      boards.push({
        category: category(key),
        rows: rows.map((r, i) => ({
          rank: i + 1,
          pitcherId: r.pitcherId,
          name: r.shortName,
          href: pitcherPagePath(r.pitcherId, r.fullName),
          value: r.value.toFixed(precision),
        })),
      });
    };

    arsenalBoard("velo_ff", speedCsv, "ff_avg_speed", 1);
    if (k.length) {
      const people = await fetchPersonsCached(k.map((x) => x.pitcher_id));
      boards.push({
        category: category("strikeouts"),
        rows: k.map((x) => {
          const p = people.get(x.pitcher_id);
          const full = p?.fullName ?? `Pitcher #${x.pitcher_id}`;
          return {
            rank: x.rank,
            pitcherId: x.pitcher_id,
            name: p ? formatShortName({ first_name: p.firstName ?? null, last_name: p.lastName ?? null, full_name: full }) : full,
            href: pitcherPagePath(x.pitcher_id, full),
            value: String(x.strikeouts),
          };
        }),
      });
    }
    arsenalBoard("spin_ff", spinCsv, "ff_avg_spin", 0);
    return boards;
  },
  ["past-season-boards-v1"],
  { revalidate: 60 * 60 * 24 },
);
