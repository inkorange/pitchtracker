import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensurePitcherSeasonCache } from "@/lib/cache/backfill";
import { fetchPersonsCached } from "@/lib/statsapi/client";
import { botIdGuard } from "@/lib/botid-guard";

// Returns every at-bat the given pitcher faced this batter in across
// the selected season. Drives the matchups list on /pitcher/[id]
// once the user picks a batter from the typeahead.
//
//   GET /api/pitcher/[id]/matchups?batterId=Y&season=Z
// Returns: { batterName, atBats: [{ game_pk, at_bat_number, ... }] }
// sorted chronologically by game_date.

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface AtBatSummary {
  game_pk: number;
  at_bat_number: number;
  game_date: string;
  inning: number | null;
  inning_topbot: string | null;
  away_abbr: string | null;
  home_abbr: string | null;
  /**
   * The team the batter was playing for during this at-bat — derived
   * from inning_topbot (Top → away batting, Bot → home batting). Used
   * to fetch the right team logo on matchup rows.
   */
  batter_team_id: number | null;
  pitch_count: number;
  /** Last pitch's `events` if non-empty, else its `description`. */
  outcome: string | null;
  /**
   * Last pitch's `description` (called_strike / swinging_strike /
   * foul_tip / …). Needed to differentiate strikeout types when
   * formatting the AB-result label client-side.
   */
  last_description: string | null;
}

interface PitchRow {
  game_pk: number;
  at_bat_number: number;
  pitch_number: number;
  description: string | null;
  events: string | null;
  inning: number | null;
  inning_topbot: string | null;
  pitch_games: {
    game_date: string;
    home_team_id: number | null;
    away_team_id: number | null;
  } | null;
}

export async function GET(request: Request, { params }: RouteParams) {
  const botBlock = await botIdGuard();
  if (botBlock) return botBlock;

  const { id } = await params;
  const pitcherId = Number(id);
  const url = new URL(request.url);
  const batterId = Number(url.searchParams.get("batterId"));
  const season = Number(url.searchParams.get("season")) || new Date().getFullYear();

  if (!Number.isFinite(pitcherId) || !Number.isFinite(batterId)) {
    return NextResponse.json(
      { error: "Pitcher id and batterId required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  await ensurePitcherSeasonCache(pitcherId, season);

  const { data, error } = await supabase
    .from("pitch_game_pitches")
    .select(
      "game_pk, at_bat_number, pitch_number, description, events, inning, inning_topbot, pitch_games!inner(season, game_type, game_date, home_team_id, away_team_id)",
    )
    .eq("pitcher_id", pitcherId)
    .eq("batter_id", batterId)
    .eq("pitch_games.season", season)
    .eq("pitch_games.game_type", "R")
    .order("game_pk", { ascending: true })
    .order("at_bat_number", { ascending: true })
    .order("pitch_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as PitchRow[];

  // Group by (game_pk, at_bat_number); track last-pitch outcome.
  type Bucket = {
    game_pk: number;
    at_bat_number: number;
    game_date: string;
    inning: number | null;
    inning_topbot: string | null;
    home_team_id: number | null;
    away_team_id: number | null;
    pitch_count: number;
    last_description: string | null;
    last_events: string | null;
  };
  const byKey = new Map<string, Bucket>();
  const teamIds = new Set<number>();
  for (const r of rows) {
    const meta = r.pitch_games;
    if (!meta) continue;
    if (meta.home_team_id) teamIds.add(meta.home_team_id);
    if (meta.away_team_id) teamIds.add(meta.away_team_id);
    const key = `${r.game_pk}-${r.at_bat_number}`;
    const b: Bucket = byKey.get(key) ?? {
      game_pk: r.game_pk,
      at_bat_number: r.at_bat_number,
      game_date: meta.game_date,
      inning: r.inning,
      inning_topbot: r.inning_topbot,
      home_team_id: meta.home_team_id,
      away_team_id: meta.away_team_id,
      pitch_count: 0,
      last_description: null,
      last_events: null,
    };
    b.pitch_count += 1;
    b.last_description = r.description;
    b.last_events = r.events;
    byKey.set(key, b);
  }

  // Resolve team abbreviations + batter name in parallel.
  const [teamRowsResult, batterMap] = await Promise.all([
    teamIds.size > 0
      ? supabase
          .from("pitch_teams")
          .select("mlb_id, abbreviation")
          .in("mlb_id", Array.from(teamIds))
      : Promise.resolve({ data: [] as Array<{ mlb_id: number; abbreviation: string }> }),
    fetchPersonsCached([batterId]),
  ]);
  const teamAbbr = new Map<number, string>(
    (teamRowsResult.data ?? []).map((t) => [t.mlb_id, t.abbreviation]),
  );
  const batterName = batterMap.get(batterId)?.fullName ?? `Batter #${batterId}`;

  const atBats: AtBatSummary[] = Array.from(byKey.values())
    .map((b) => ({
      game_pk: b.game_pk,
      at_bat_number: b.at_bat_number,
      game_date: b.game_date,
      inning: b.inning,
      inning_topbot: b.inning_topbot,
      away_abbr: b.away_team_id ? teamAbbr.get(b.away_team_id) ?? null : null,
      home_abbr: b.home_team_id ? teamAbbr.get(b.home_team_id) ?? null : null,
      // Top half = away team batting, Bot = home team batting. If
      // inning_topbot is missing we fall back to null rather than
      // guess.
      batter_team_id:
        b.inning_topbot === "Top"
          ? b.away_team_id
          : b.inning_topbot === "Bot"
            ? b.home_team_id
            : null,
      pitch_count: b.pitch_count,
      // Prefer the events string (single, double, strikeout, ...);
      // fall back to the last description (called_strike etc.) for
      // ABs that ended without an event row populated.
      outcome:
        (b.last_events && b.last_events.length > 0
          ? b.last_events
          : b.last_description) ?? null,
      last_description: b.last_description,
    }))
    .sort((a, b) => {
      const d = a.game_date.localeCompare(b.game_date);
      if (d !== 0) return d;
      return a.at_bat_number - b.at_bat_number;
    });

  return NextResponse.json(
    { batterName, atBats },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
