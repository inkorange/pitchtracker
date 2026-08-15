import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensurePitcherSeasonCache } from "@/lib/cache/backfill";
import { botIdGuard } from "@/lib/botid-guard";
import { categorizeDescription, type OutcomeCategory } from "@/lib/viz/colors";
import { expandAtBatEvents } from "@/lib/at-bat-events";
import { fetchPersonsCached } from "@/lib/statsapi/client";
import {
  buildSequencingMatrix,
  type SequencingMatrix,
} from "@/lib/pitch/sequencingMatrix";
import {
  buildSequencingDrift,
  type DriftPitch,
  type SequencingDrift,
} from "@/lib/pitch/sequencingDrift";
import {
  type ArsenalRadar,
  MIN_LEAGUE_PITCHES,
  type RadarPitch,
  type RadarAxis,
  RADAR_AXES,
} from "@/lib/pitch/arsenalRadar";

// JSON arsenal endpoint backing the persistent Scene shell on the
// pitcher route. Mirrors the pitch-fetch + filter logic that lived
// inline in /pitcher/[id]/page.tsx, returning only what the 3D Scene
// needs (renderable pitches + display label) so the layout-level
// Scene can refresh on URL change without remounting the Canvas.

interface ArsenalParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: ArsenalParams) {
  const botBlock = await botIdGuard();
  if (botBlock) return botBlock;

  const { id } = await params;
  const pitcherId = Number(id);
  if (!Number.isFinite(pitcherId)) {
    return NextResponse.json({ error: "Invalid pitcher id" }, { status: 400 });
  }
  const url = new URL(request.url);
  const sp = url.searchParams;
  const season = Number(sp.get("season")) || new Date().getFullYear();
  const hand = sp.get("hand");
  const game = sp.get("game");
  const pitchTypesParam = sp.get("pitch") ?? "";
  const outcomesParam = sp.get("outcome") ?? "";
  const eventParam = sp.get("event") ?? "";
  const veloMinParam = sp.get("veloMin");
  const veloMaxParam = sp.get("veloMax");
  // Batter scope: when set, narrows the sequencing matrix to pitches
  // thrown TO that specific batter. Other parts of the arsenal
  // response (renderable pitches, arsenalRadar) are NOT scoped — the
  // 3D scene + per-pitch tiles still reflect the full season.
  const vsBatterParam = sp.get("vsBatter");
  const vsBatter =
    vsBatterParam && !Number.isNaN(Number(vsBatterParam))
      ? Number(vsBatterParam)
      : null;

  const supabase = await createClient();

  // Same lazy backfill as page.tsx: first visit per pitcher × season
  // pulls from Savant before the SELECT below sees an empty cache.
  await ensurePitcherSeasonCache(pitcherId, season);

  // Fire the pitcher metadata fetch in parallel with page 1 of the
  // pitch pagination loop. We await pitcher after the loop finishes.
  const pitcherPromise = supabase
    .from("pitch_pitchers")
    .select("mlb_id, full_name, last_name")
    .eq("mlb_id", pitcherId)
    .maybeSingle();

  // Paginate the pitch fetch — Supabase enforces a hard 1000-row
  // server-side cap (`db-max-rows`) that `.range(0, N)` does NOT
  // bypass. PR #50 fixed this on src/app/pitcher/[id]/page.tsx; the
  // same pattern is required here so the Stats view doesn't silently
  // undercount above 1000 pitches.
  //
  // Ordered on the primary key so pages are stable across requests.
  const PITCH_SELECT =
    "game_pk, at_bat_number, pitch_number, pitch_type, stand, description, events, batter_id, delta_run_exp, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension, pitch_games!inner(season, game_type, game_date)";
  const PITCH_PAGE_SIZE = 1000;
  const PITCH_MAX_PAGES = 20;

  function buildPitchPageQuery(page: number) {
    let q = supabase
      .from("pitch_game_pitches")
      .select(PITCH_SELECT)
      .eq("pitcher_id", pitcherId)
      .eq("pitch_games.season", season)
      .eq("pitch_games.game_type", "R")
      .order("game_pk", { ascending: true })
      .order("at_bat_number", { ascending: true })
      .order("pitch_number", { ascending: true })
      .range(page * PITCH_PAGE_SIZE, (page + 1) * PITCH_PAGE_SIZE - 1);
    if (hand === "L" || hand === "R") q = q.eq("stand", hand);
    if (game) q = q.eq("game_pk", Number(game));
    // vsBatter is intentionally NOT filtered here. The 3D scene shell
    // consumes this endpoint and needs the full season's pitches for
    // its canvas. vsBatter is applied JS-side downstream (search this
    // file for `p.batter_id !== vsBatter`) so the same response can
    // serve both the batter-agnostic 3D scene and the batter-scoped
    // stats view.
    return q;
  }

  type PitchRow = NonNullable<
    Awaited<ReturnType<typeof buildPitchPageQuery>>["data"]
  >[number];

  const pitchesRaw: PitchRow[] = [];
  for (let page = 0; page < PITCH_MAX_PAGES; page++) {
    const { data, error } = await buildPitchPageQuery(page);
    if (error || !data) {
      console.error("[arsenal] pitch page", page, error);
      break;
    }
    pitchesRaw.push(...(data as PitchRow[]));
    if (data.length < PITCH_PAGE_SIZE) break;
  }

  const { data: pitcher } = await pitcherPromise;

  if (!pitcher) {
    return NextResponse.json({ error: "Pitcher not found" }, { status: 404 });
  }

  const cached = pitchesRaw;
  const outcomes = outcomesParam
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is OutcomeCategory =>
      ["whiff", "called", "ball", "foul", "inplay", "other"].includes(s),
    );
  const outcomeSet = new Set(outcomes);

  // At-bat result filter. Narrows to the TERMINATING pitch of each AB
  // (the one whose `events` column is set). Chip keys like "strikeout"
  // expand into the full set of MLB event values for that result.
  const atBatEventInputs = eventParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const atBatEventSet = expandAtBatEvents(atBatEventInputs);

  const veloMin =
    veloMinParam && !Number.isNaN(Number(veloMinParam)) ? Number(veloMinParam) : null;
  const veloMax =
    veloMaxParam && !Number.isNaN(Number(veloMaxParam)) ? Number(veloMaxParam) : null;

  const arsenal = cached.filter((p) => {
    if (outcomeSet.size > 0 && !outcomeSet.has(categorizeDescription(p.description))) {
      return false;
    }
    if (atBatEventSet.size > 0) {
      if (!p.events || !atBatEventSet.has(p.events)) return false;
    }
    if (veloMin != null && (p.release_speed == null || p.release_speed < veloMin)) {
      return false;
    }
    if (veloMax != null && (p.release_speed == null || p.release_speed > veloMax)) {
      return false;
    }
    // Batter scope: when ?vsBatter=<id> is set, narrow the renderable
    // pitch set (and therefore every client-side stats card that
    // aggregates from it — headline, arsenal tiles, movement, velo
    // histograms, release cluster, heat grid, VAA bars) to pitches
    // thrown to that batter only. The 3D scene shell strips this
    // param before fetching, so the arsenal canvas remains
    // season-wide.
    if (vsBatter != null && p.batter_id !== vsBatter) {
      return false;
    }
    return true;
  });
  const pitchTypes = pitchTypesParam.split(",").filter(Boolean);
  const pitchTypeSet = new Set(pitchTypes);
  const filtered =
    pitchTypeSet.size === 0
      ? arsenal
      : arsenal.filter((p) => p.pitch_type != null && pitchTypeSet.has(p.pitch_type));
  // Flatten the joined pitch_games.game_date onto each pitch and
  // drop the nested object. The 3D scene needs game_date for the
  // recency-based render split (recent ribbons / historical lines)
  // and shipping the join nested would duplicate season/game_type
  // bytes for every pitch.
  const renderable = filtered
    .filter((p) => p.vx0 != null && p.vy0 != null && p.vz0 != null)
    .map(({ pitch_games, ...rest }) => ({
      ...rest,
      game_date: pitch_games?.game_date ?? null,
    }));

  // Opt-in: sequencing matrix computed from the PRE-FILTER `cached`
  // pitch set (still scoped to season/hand/game from the SQL query
  // but ignoring outcome / pitch_type / event filters). The matrix
  // needs unbroken pitch sequences within each at-bat — applying
  // the outcome filter here would erase intermediate pitches and
  // produce nonsense transitions. Off by default to keep the
  // response payload small for callers that only want the
  // renderable pitches.
  let sequenceMatrix: SequencingMatrix | null = null;
  let sequenceBatterName: string | null = null;
  if (sp.get("includeSequence") === "1") {
    // Batter-scoped matrix: filter `cached` to pitches thrown to the
    // specified batter before building the matrix. The unscoped
    // matrix uses all the pre-filter pitches as before.
    const sequencePool = vsBatter != null
      ? cached.filter((p) => p.batter_id === vsBatter)
      : cached;
    sequenceMatrix = buildSequencingMatrix(sequencePool);
    if (vsBatter != null) {
      const batterMap = await fetchPersonsCached([vsBatter]);
      sequenceBatterName = batterMap.get(vsBatter)?.fullName ?? null;
    }
  }

  // Opt-in: arsenal radar — pitcher's league percentile per pitch
  // type across five axes (velocity, spin, iVB, HB, whiff%).
  // Computed from pitch_pitcher_aggregates with PERCENT_RANK
  // windowed per pitch_type. Pitchers with fewer than
  // MIN_LEAGUE_PITCHES of a given pitch are excluded from the
  // percentile pool so tiny samples don't poison the distribution.
  //
  // Always loaded when requested — including in batter-scoped mode.
  // The radar reads season-wide league percentile from the
  // pre-aggregated `pitch_pitcher_aggregates` table, which is
  // independent of the batter filter on `pitches` above. Showing
  // "here's how his slider ranks league-wide" alongside the
  // batter-scoped tile counts is complementary context, not a
  // contradictory one.
  let arsenalRadar: ArsenalRadar | null = null;
  if (sp.get("includeRadar") === "1") {
    arsenalRadar = await fetchArsenalRadar(supabase, pitcherId, season);
  }

  // Opt-in: per-game sequencing drift timeline. Each game gets a
  // TVD-against-the-season-baseline metric so the stats view can
  // surface games where the pitcher visibly changed his approach.
  // Skipped under batter scope — per-(pitcher × batter × game)
  // samples are typically 1–3 ABs and the per-game matrices are too
  // noisy to compare meaningfully against a season baseline.
  let sequenceDrift: SequencingDrift | null = null;
  if (sp.get("includeSequenceVariance") === "1" && vsBatter == null) {
    const driftPitches: DriftPitch[] = cached
      .filter((p): p is typeof p & {
        pitch_games: { game_date: string };
      } => !!p.pitch_games?.game_date)
      .map((p) => ({
        game_pk: p.game_pk,
        at_bat_number: p.at_bat_number,
        pitch_number: p.pitch_number,
        pitch_type: p.pitch_type,
        game_date: p.pitch_games.game_date,
      }));
    sequenceDrift = buildSequencingDrift(driftPitches);
  }

  return NextResponse.json(
    {
      pitches: renderable,
      pitcherLabel: pitcherLastName(pitcher),
      sequenceMatrix,
      sequenceBatterName,
      sequenceDrift,
      arsenalRadar,
    },
    {
      headers: {
        "cache-control": "public, max-age=60, s-maxage=60",
      },
    },
  );
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Pull the per-pitch-type league percentile + raw values via a
// PERCENT_RANK windowed query, then keep just this pitcher's rows.
// The window is partitioned by pitch_type so a slider's spin rank
// is computed against all sliders, not against fastballs.
//
// We use the `batter_hand = '*'` aggregate (all batters combined)
// for first pass. Hand-split radars would extend the row shape but
// are deferred.
async function fetchArsenalRadar(
  supabase: SupabaseClient,
  pitcherId: number,
  season: number,
): Promise<ArsenalRadar | null> {
  // Split into two queries so neither runs up against PostgREST's
  // hard 1000-row server-side cap (which `.range(0, 9999)` does NOT
  // bypass — the cap is enforced by the server-side `max-rows`
  // config). The season-wide '*' aggregate pool sits at ~3,200 rows
  // total, so the previous "fetch everything then filter to this
  // pitcher in JS" pattern silently truncated half the league and
  // dropped pitcher 694973's rows entirely.
  //
  // Step 1: pitcher's own rows. Always tiny (one per pitch type the
  // pitcher throws, ≤10 in practice), no cap risk. No SQL sample
  // floor — even sub-25 pitch types get a radar entry; the
  // MIN_LEAGUE_PITCHES filter applies only to the percentile pool.
  type Row = {
    pitcher_id: number;
    pitch_type: string | null;
    avg_velocity: number | null;
    avg_spin_rate: number | null;
    avg_induced_vertical_break: number | null;
    avg_horizontal_break: number | null;
    whiff_rate: number | null;
    pitch_count: number | null;
  };
  const select =
    "pitcher_id, pitch_type, avg_velocity, avg_spin_rate, avg_induced_vertical_break, avg_horizontal_break, whiff_rate, pitch_count";
  const { data: mineData, error: mineErr } = await supabase
    .from("pitch_pitcher_aggregates")
    .select(select)
    .eq("pitcher_id", pitcherId)
    .eq("season", season)
    .eq("batter_hand", "*");
  if (mineErr || !mineData) return null;
  const mine = (mineData as Row[])
    .filter((r) => r.pitch_type)
    .sort((a, b) => (b.pitch_count ?? 0) - (a.pitch_count ?? 0));
  if (mine.length === 0) {
    return { pitches: [], minPitchesForLeague: MIN_LEAGUE_PITCHES };
  }

  // Step 2: league percentile pool, fetched per pitch_type the
  // pitcher actually throws. The largest single pitch type has ~600
  // pitchers in the season — safely under the row cap — and only
  // running the queries we need is faster than always pulling 3,200
  // rows. Parallel fan-out so the radar latency stays close to one
  // round-trip.
  const myTypes = Array.from(
    new Set(mine.map((r) => r.pitch_type!).filter(Boolean)),
  );
  const poolByType = new Map<string, Row[]>();
  await Promise.all(
    myTypes.map(async (pt) => {
      const { data } = await supabase
        .from("pitch_pitcher_aggregates")
        .select(select)
        .eq("season", season)
        .eq("batter_hand", "*")
        .eq("pitch_type", pt)
        .gte("pitch_count", MIN_LEAGUE_PITCHES);
      poolByType.set(pt, (data ?? []) as Row[]);
    }),
  );

  const out: RadarPitch[] = mine.map((row) => {
    const pool = poolByType.get(row.pitch_type!) ?? [];
    const raw: Record<RadarAxis, number | null> = {
      velo: row.avg_velocity,
      spin: row.avg_spin_rate,
      // Break metrics stored with sign — absolute value here so
      // "more break" is the axis direction regardless of arm side.
      ivb:
        row.avg_induced_vertical_break != null
          ? Math.abs(row.avg_induced_vertical_break)
          : null,
      hb:
        row.avg_horizontal_break != null
          ? Math.abs(row.avg_horizontal_break)
          : null,
      whiff: row.whiff_rate,
    };
    const percentile: Record<RadarAxis, number> = {
      velo: NaN,
      spin: NaN,
      ivb: NaN,
      hb: NaN,
      whiff: NaN,
    };
    for (const axis of RADAR_AXES) {
      const myVal = raw[axis];
      if (myVal == null) continue;
      const values = pool
        .map((p) => valueForAxis(p, axis))
        .filter((v): v is number => v != null);
      if (values.length === 0) continue;
      // PERCENT_RANK: share of population strictly less than myVal.
      // Matches Postgres semantics — 0.0 for the league minimum,
      // 1.0 for the unique max.
      let below = 0;
      for (const v of values) {
        if (v < myVal) below += 1;
      }
      percentile[axis] =
        values.length > 1 ? below / (values.length - 1) : 0;
    }
    return {
      pitch_type: row.pitch_type!,
      raw,
      percentile,
      pitchCount: row.pitch_count ?? 0,
    };
  });

  return { pitches: out, minPitchesForLeague: MIN_LEAGUE_PITCHES };
}

function valueForAxis(
  row: {
    avg_velocity: number | null;
    avg_spin_rate: number | null;
    avg_induced_vertical_break: number | null;
    avg_horizontal_break: number | null;
    whiff_rate: number | null;
  },
  axis: RadarAxis,
): number | null {
  switch (axis) {
    case "velo":
      return row.avg_velocity;
    case "spin":
      return row.avg_spin_rate;
    case "ivb":
      return row.avg_induced_vertical_break != null
        ? Math.abs(row.avg_induced_vertical_break)
        : null;
    case "hb":
      return row.avg_horizontal_break != null
        ? Math.abs(row.avg_horizontal_break)
        : null;
    case "whiff":
      return row.whiff_rate;
  }
}

function pitcherLastName(p: { full_name: string; last_name?: string | null }): string {
  if (p.last_name && p.last_name.trim().length > 0) return p.last_name;
  const parts = p.full_name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? p.full_name;
}
