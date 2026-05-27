import { createClient } from "@/lib/supabase/server";
import { fetchGameResults, type MlbGameResult } from "@/lib/statsapi/client";
import { GameCard } from "@/components/games/GameCard";

// Homepage strip — yesterday's MLB results, one card per Final
// regular-season game. Each card links to /at-bat/[gamePk] so the
// user lands on the per-game at-bat browser and can dig into any
// pitcher's outing.
//
// Renders nothing if the Stats API call fails or yesterday had no
// final regular-season games (e.g. off-day, preseason).

export async function YesterdayGamesStrip() {
  // "Yesterday" in America/New_York — the canonical baseball day
  // boundary. en-CA's date format is YYYY-MM-DD which is what the
  // Stats API expects.
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString(
    "en-CA",
    { timeZone: "America/New_York" },
  );

  let games: MlbGameResult[] = [];
  try {
    games = await fetchGameResults(yesterdayIso);
  } catch {
    return null;
  }

  // Only Final regular-season games. abstractGameState="Final" covers
  // F (final), D (delayed), W (warmup), A (active) — we want F only,
  // so check both abstract + detailed score availability.
  const finals = games.filter(
    (g) =>
      g.gameType === "R" &&
      g.status.abstractGameState === "Final" &&
      g.home.score != null &&
      g.away.score != null,
  );
  if (finals.length === 0) return null;

  // Pull team abbreviations from supabase so the card has 2-3 letter
  // codes that match the rest of the site's chrome.
  const supabase = await createClient();
  const teamIds = Array.from(
    new Set(finals.flatMap((g) => [g.home.teamId, g.away.teamId])),
  );
  const { data: teamRows } = await supabase
    .from("pitch_teams")
    .select("mlb_id, abbreviation")
    .in("mlb_id", teamIds);
  const abbrById = new Map<number, string>(
    (teamRows ?? []).map((t) => [t.mlb_id, t.abbreviation]),
  );

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-white/55">
          Yesterday&apos;s games
        </h2>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/35 tabular-nums">
          {yesterdayIso}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {finals.map((g) => (
          <GameCard
            key={g.gamePk}
            game={g}
            awayAbbr={abbrById.get(g.away.teamId) ?? "?"}
            homeAbbr={abbrById.get(g.home.teamId) ?? "?"}
          />
        ))}
      </div>
    </section>
  );
}
