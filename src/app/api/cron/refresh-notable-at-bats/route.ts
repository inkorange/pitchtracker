import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { categorizeDescription } from "@/lib/viz/colors";
import type { TablesInsert } from "@/lib/supabase/types";
import {
  loadGamePitches,
  loadGamesPitches,
} from "@/lib/cache/savant-game";
import { COMPETITIVE_GAME_TYPES } from "@/lib/season/current-season";

// 60s was not enough: on 2026-08-28 this route 504'd partway through the
// 7-day notable-at-bats rescan and never reached the daily-pick write,
// silently freezing Pitch of the Day on the previous run's row. The pick
// phase now runs first and is cheap (see below), but give the notable
// rescan real headroom so it stops being a coin flip.
export const maxDuration = 300;

// Display names for the pitch_type abbreviations Statcast uses. The
// reason string surfaced on the homepage Daily Pick Strip uses the
// long names so a casual reader doesn't have to know what "ST" means.
const PITCH_TYPE_NAMES: Record<string, string> = {
  FF: "fastball",
  SI: "sinker",
  FC: "cutter",
  SL: "slider",
  ST: "sweeper",
  CU: "curveball",
  KC: "knuckle curve",
  SV: "slurve",
  CS: "slow curve",
  CH: "changeup",
  FS: "splitter",
};

// Two scoring pools compete for POTD/WoW. The category with the higher
// score wins, so a 104mph FF still beats a meh slider, and a nasty 22"
// curveball buried for K3 still beats a 100mph FF — variety without
// abandoning velo as the obvious-good fallback.
const HEAT_TYPES = new Set(["FF", "SI"]);
const BREAKER_TYPES = new Set(["SL", "ST", "CU", "KC", "SV", "CS"]);

// The Statcast `description` values that categorizeDescription() maps to
// "whiff". scoreCandidate() returns null for anything else, so we push
// this as an `.in()` filter into Postgres and pull ~250 rows/day instead
// of ~4,500. Keep in sync with categorizeDescription in @/lib/viz/colors.
const WHIFF_DESCRIPTIONS = [
  "swinging_strike",
  "swinging_strike_blocked",
  "missed_bunt",
  "foul_tip",
];

interface ScoredPitch {
  score: number;
  reason: string;
}

interface PitchForScoring {
  pitch_type: string | null;
  description: string | null;
  release_speed: number | null;
  release_spin_rate: number | null;
  strikes: number | null;
  plate_x: number | null;
  plate_z: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
}

// Returns null when the pitch isn't a swinging strike on a heat or
// breaker pitch type. Calibration aims for ~3-out-of-5 breakers winning
// the daily slot vs heat — see preview SQL in the PR description.
function scoreCandidate(p: PitchForScoring): ScoredPitch | null {
  if (categorizeDescription(p.description) !== "whiff") return null;
  if (p.release_speed == null || !p.pitch_type) return null;

  const velo = Number(p.release_speed);
  // strikes is the count BEFORE this pitch. strikes=2 + swinging strike
  // means this pitch was strike 3 (the K-ending pitch). Statcast's
  // `events` field is only populated on the AB-ending pitch and may be
  // empty on intermediate ones, so counting strikes is more reliable.
  const isK3 = p.strikes === 2;
  const pitchName = PITCH_TYPE_NAMES[p.pitch_type] ?? p.pitch_type.toLowerCase();

  if (HEAT_TYPES.has(p.pitch_type)) {
    // 90mph baseline so 100 = 10, 102 = 12, 104 = 14. Calibrated so
    // 104mph still wins against a typical buried K3 slider but loses
    // to a truly spectacular curveball.
    const score = Math.max(0, velo - 90);
    const result = isK3 ? "strike 3 swinging" : "swing & miss";
    return {
      score,
      reason: `${velo.toFixed(1)} mph ${pitchName}, ${result}`,
    };
  }

  if (BREAKER_TYPES.has(p.pitch_type)) {
    // pfx_x / pfx_z are stored in FEET (Statcast convention). Convert
    // to inches for the human-readable break number and so the bonus
    // threshold reads naturally ("over 12 inches of break").
    const pfxX = p.pfx_x != null ? Number(p.pfx_x) : 0;
    const pfxZ = p.pfx_z != null ? Number(p.pfx_z) : 0;
    const breakIn = 12 * Math.sqrt(pfxX * pfxX + pfxZ * pfxZ);
    const breakBonus = Math.max(0, (breakIn - 12) / 1.5);

    // plate_x / plate_z are also in feet, measured at the front of the
    // plate. Zone bottom ≈ 1.5 ft, zone half-width ≈ 0.83 ft. "Buried
    // low" = below 1.0 ft (well under the zone). "Off edge" = outside
    // 1.0 ft horizontally (clearly off the plate, not just nibbling).
    const plateX = p.plate_x != null ? Number(p.plate_x) : 0;
    const plateZ = p.plate_z != null ? Number(p.plate_z) : 2.5;
    const buriedLow = plateZ < 1.0;
    const offEdge = Math.abs(plateX) > 1.0;
    const buriedBonus = (buriedLow ? 2 : 0) + (offEdge ? 1.5 : 0);

    const k3Bonus = isK3 ? 2 : 0;
    const spin = p.release_spin_rate != null ? Number(p.release_spin_rate) : 0;
    const spinBonus = spin >= 2800 ? 1 : 0;

    const score = breakBonus + buriedBonus + k3Bonus + spinBonus;
    if (score <= 0) return null;

    // Build the reason from the most distinctive signals so the card
    // tells a story: pitch + velo + break + buried/off-edge + result.
    const breakRound = Math.round(breakIn);
    const buriedLabel = buriedLow
      ? "buried for "
      : offEdge
        ? "chased off the plate for "
        : "";
    const resultLabel = isK3 ? "strike 3 swinging" : "swing & miss";
    return {
      score,
      reason: `${Math.round(velo)} mph ${pitchName}, ${breakRound}″ break, ${buriedLabel}${resultLabel}`,
    };
  }

  return null;
}

type CandidateRow = PitchForScoring & {
  game_pk: number;
  at_bat_number: number;
  pitch_number: number;
  pitcher_id: number | null;
  batter_id: number | null;
  // Attached client-side from the game map (pitch rows don't carry a date).
  game_date_resolved?: string | null;
};

type FeaturePick = {
  game_pk: number;
  game_date: string;
  at_bat_number: number;
  pitch_number: number;
  pitcher_id: number | null;
  batter_id: number | null;
  score: number;
  reason: string;
};

// Compute "today"/"yesterday" in MLB-local (ET) terms. Doing it in ET
// means the run consistently looks back at "last night's games"
// regardless of UTC date rollover quirks.
function etDates(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayET = fmt.format(now); // "YYYY-MM-DD"
  const [y, m, d] = todayET.split("-").map(Number);
  const todayUtc = new Date(Date.UTC(y, m - 1, d));
  const yesterdayUtc = new Date(todayUtc);
  yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);
  return {
    todayET,
    yesterdayET: yesterdayUtc.toISOString().slice(0, 10),
    // 0=Sun, 1=Mon
    isMondayET: todayUtc.getUTCDay() === 1,
  };
}

type GameRef = { game_pk: number; game_date: string };

// Resolve which games fall in a date range. Cheap: pitch_games is one row
// per game and pitch_games_date_idx covers this directly.
async function fetchGamesInRange(
  supabase: ReturnType<typeof createAdminClient>,
  fromDate: string,
  toDate: string,
): Promise<{ games: GameRef[]; error: string | null }> {
  const { data, error } = await supabase
    .from("pitch_games")
    .select("game_pk, game_date")
    .gte("game_date", fromDate)
    .lte("game_date", toDate)
    .limit(2000);
  if (error) return { games: [], error: error.message };
  return { games: (data ?? []) as GameRef[], error: null };
}

// Pull every whiff for a set of games, paging past PostgREST's 1000-row cap.
//
// Filter by game_pk, NOT by an embedded pitch_games.game_date filter. Every
// index on pitch_game_pitches leads with game_pk (pkey, at_bat_idx, ...) and
// there is none on description or on the joined date — so the embedded-date
// form plans as a full scan of a multi-million-row table and dies on the
// statement timeout. Resolving game_pks first turns the same work into an
// index nested loop: ~32ms for a day's whiffs.
//
// Restricting to whiff descriptions is still what keeps the payload small:
// ~250 rows for a single day and ~1,700 for a 7-day window, versus ~4,500/day
// if we fetched everything and filtered in JS.
async function fetchWhiffCandidates(
  supabase: ReturnType<typeof createAdminClient>,
  games: GameRef[],
): Promise<{ rows: CandidateRow[]; error: string | null }> {
  const dateByPk = new Map(games.map((g) => [g.game_pk, g.game_date]));
  const pks = games.map((g) => g.game_pk);
  const dateByPkLocal = dateByPk;

  // Whiff candidates, from the cached per-game Savant reads rather than
  // paginated scans of pitch_game_pitches. The description filter that
  // was pushed into SQL is applied here instead, over the same set.
  const allPitches = await loadGamesPitches(pks);
  const out = allPitches
    .filter(
      (p) =>
        p.description != null && WHIFF_DESCRIPTIONS.includes(p.description),
    )
    .map((p) => {
      const row = p as unknown as CandidateRow;
      // game_date isn't on the pitch row; attach it from the game map so
      // bestCandidate() can key the feature by the date of the game.
      row.game_date_resolved = dateByPkLocal.get(p.game_pk) ?? null;
      return row;
    });

  return { rows: out, error: null };
}

function bestCandidate(rows: CandidateRow[]): FeaturePick | null {
  let best: FeaturePick | null = null;
  for (const p of rows) {
    const scored = scoreCandidate(p);
    if (!scored) continue;
    if (best && scored.score <= best.score) continue;
    best = {
      game_pk: p.game_pk,
      game_date: p.game_date_resolved ?? "",
      at_bat_number: p.at_bat_number,
      pitch_number: p.pitch_number,
      pitcher_id: p.pitcher_id,
      batter_id: p.batter_id,
      score: scored.score,
      reason: scored.reason,
    };
  }
  return best;
}

// Score recent at-bats and pick the daily features.
//
// PHASE 1 (cheap, runs first): pick Pitch of the Day from yesterday's
// games — and, on Mondays, Whiff of the Week from the 7-day window.
// Both write immediately. This used to run LAST, behind a ~100-query
// notable-at-bats rescan, which meant any timeout in the expensive
// bookkeeping cost us the actual headline feature.
//
// PHASE 2 (expensive, best-effort): rebuild the rolling
// pitch_notable_at_bats window. Bounded by a wall-clock budget so it
// degrades to a partial refresh instead of a 504.
//
// Only runs over already-cached pitches — we don't pull anything new
// from Savant here. That's precache-recent-games' job (15:00 UTC).
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startedAt = Date.now();
  const url = new URL(request.url);
  const lookbackDays = Number(url.searchParams.get("days") ?? "7");
  // Leave ~45s of headroom under maxDuration for phase 2 to finish its
  // current chunk and for the response to serialize.
  const budgetMs = Number(url.searchParams.get("budget_ms") ?? "240000");
  const supabase = createAdminClient();

  const now = new Date();
  const { todayET, yesterdayET, isMondayET } = etDates(now);
  const cutoff = new Date(`${todayET}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - lookbackDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  // ---------------------------------------------------------------
  // PHASE 1 — daily feature picks
  // ---------------------------------------------------------------

  // Was there even MLB baseball yesterday? Distinguishes "off-day, so
  // no pick is correct" from "games happened but we produced nothing",
  // which is a real failure worth alerting on.
  const { games: yesterdayGames, error: gamesErr } = await fetchGamesInRange(
    supabase,
    yesterdayET,
    yesterdayET,
  );
  if (gamesErr) {
    return NextResponse.json(
      { error: `yesterday game lookup: ${gamesErr}`, stale: true },
      { status: 500 },
    );
  }
  const scheduledYesterday = yesterdayGames.length;

  const { rows: potdRows, error: potdErr } = await fetchWhiffCandidates(
    supabase,
    yesterdayGames,
  );
  // How many of yesterday's games actually have pitches cached — the
  // signal that separates "Savant is late / precache failed" from
  // "scoring found nothing".
  const cachedYesterday = new Set(potdRows.map((r) => r.game_pk)).size;
  if (potdErr) {
    return NextResponse.json(
      { error: `potd candidate fetch: ${potdErr}`, stale: true },
      { status: 500 },
    );
  }
  const pitchOfDay = bestCandidate(potdRows);

  // Whiff of the Week is gated to Mondays. Daily WoW updates produced
  // noisy week-over-week jitter where a single high-scoring pitch
  // reshuffled the headline every morning.
  let whiffOfWeek: FeaturePick | null = null;
  let wowErr: string | null = null;
  if (isMondayET) {
    const week = await fetchGamesInRange(supabase, cutoffIso, yesterdayET);
    if (week.error) {
      wowErr = week.error;
    } else {
      const res = await fetchWhiffCandidates(supabase, week.games);
      wowErr = res.error;
      whiffOfWeek = bestCandidate(res.rows);
    }
  }

  const featureRows: TablesInsert<"pitch_daily_features">[] = [];
  if (pitchOfDay?.game_date) {
    featureRows.push({
      feature_kind: "pitch_of_the_day",
      // Keyed by the date of the GAME, not the date of this run, so a
      // retry later today completes the same row instead of minting a
      // new one — and so the UI can show when the pitch was actually
      // thrown.
      game_date: pitchOfDay.game_date,
      feature_date: todayET,
      game_pk: pitchOfDay.game_pk,
      at_bat_number: pitchOfDay.at_bat_number,
      pitch_number: pitchOfDay.pitch_number,
      pitcher_id: pitchOfDay.pitcher_id,
      batter_id: pitchOfDay.batter_id,
      reason: pitchOfDay.reason,
    });
  }
  if (whiffOfWeek?.game_date) {
    featureRows.push({
      feature_kind: "whiff_of_the_week",
      game_date: whiffOfWeek.game_date,
      feature_date: todayET,
      game_pk: whiffOfWeek.game_pk,
      at_bat_number: whiffOfWeek.at_bat_number,
      pitch_number: whiffOfWeek.pitch_number,
      pitcher_id: whiffOfWeek.pitcher_id,
      batter_id: whiffOfWeek.batter_id,
      reason: whiffOfWeek.reason,
    });
  }
  if (featureRows.length > 0) {
    const { error: featErr } = await supabase
      .from("pitch_daily_features")
      .upsert(featureRows, { onConflict: "feature_kind,game_date" });
    if (featErr) {
      return NextResponse.json(
        { error: `daily feature upsert: ${featErr.message}`, stale: true },
        { status: 500 },
      );
    }
  }

  // Fail loudly. A silent 200 with no pick is what let an 8/26 at-bat
  // sit on the homepage looking like an 8/27 one. Only games-happened-
  // but-nothing-selected is an error; a genuine off-day is fine.
  const missedPotd = scheduledYesterday > 0 && !pitchOfDay;
  const incompleteCoverage =
    scheduledYesterday > 0 && cachedYesterday < scheduledYesterday;

  if (missedPotd) {
    return NextResponse.json(
      {
        error: "no pitch_of_the_day selected for a day that had MLB games",
        stale: true,
        game_date: yesterdayET,
        games_scheduled: scheduledYesterday,
        games_cached: cachedYesterday,
        whiff_candidates: potdRows.length,
        hint:
          cachedYesterday === 0
            ? "no pitches cached for yesterday — precache-recent-games likely failed or Savant is late"
            : "pitches are cached but none scored above zero — check scoreCandidate calibration",
      },
      { status: 500 },
    );
  }

  // ---------------------------------------------------------------
  // PHASE 2 — rolling notable-at-bats window (best effort)
  // ---------------------------------------------------------------

  // Source iteration from pitch_pitcher_games rather than pitch_games:
  // pitch_games holds the full schedule (current + future + historical)
  // and gte(game_date, cutoff) easily exceeds PostgREST's 1000-row cap
  // with thousands of upcoming-schedule rows. Paginate by primary-key
  // order so we catch the most-recent rows that otherwise get dropped.
  // Which games happened since the cutoff. This used to page through
  // pitch_pitcher_games joined to pitch_games; the schedule table alone
  // answers it, and pitch_games is 2 MB and stays in Postgres.
  const gameDateByPk = new Map<number, string>();
  const { data: scheduleRows, error: scheduleErr } = await supabase
    .from("pitch_games")
    .select("game_pk, game_date")
    .gte("game_date", cutoffIso)
    .lte("game_date", new Date().toISOString().slice(0, 10))
    .in("game_type", [...COMPETITIVE_GAME_TYPES]);
  if (scheduleErr) {
    console.error("[refresh-notable-at-bats] schedule read", scheduleErr);
    // Phase 1 already succeeded and is committed — report the partial
    // outcome rather than throwing away a good pick.
    return NextResponse.json(
      {
        ok: false,
        stage: "notable-at-bats",
        error: scheduleErr.message,
      },
      { status: 500 },
    );
  }
  for (const r of scheduleRows ?? []) {
    if (!gameDateByPk.has(r.game_pk)) {
      gameDateByPk.set(r.game_pk, r.game_date);
    }
  }

  // Most-recent games first so a budget cutoff drops the oldest days,
  // which are the least interesting on /daily.
  const games = Array.from(gameDateByPk, ([game_pk, game_date]) => ({
    game_pk,
    game_date,
  })).sort((a, b) => b.game_date.localeCompare(a.game_date));

  type AbAccumulator = {
    pitcher_id: number | null;
    batter_id: number | null;
    pitch_count: number;
    whiff_count: number;
    is_strikeout: boolean;
    max_abs_delta_run_exp: number;
  };

  const notableRows: TablesInsert<"pitch_notable_at_bats">[] = [];
  const GAME_CONCURRENCY = 6;
  let budgetExhausted = false;

  for (let i = 0; i < games.length; i += GAME_CONCURRENCY) {
    if (Date.now() - startedAt > budgetMs) {
      budgetExhausted = true;
      break;
    }
    const batch = games.slice(i, i + GAME_CONCURRENCY);
    // Cached per-game Savant reads rather than scans of
    // pitch_game_pitches. A day of MLB is ~15 games, so this is a
    // handful of upstream requests that the data cache then serves.
    const results = await Promise.all(
      batch.map((g) =>
        loadGamePitches(g.game_pk).then((pitches) => ({ g, pitches })),
      ),
    );

    for (const { g, pitches } of results) {
      if (pitches.length === 0) continue;
      const byAb = new Map<number, AbAccumulator>();
      for (const p of pitches) {
        let ab = byAb.get(p.at_bat_number);
        if (!ab) {
          ab = {
            pitcher_id: p.pitcher_id,
            batter_id: p.batter_id,
            pitch_count: 0,
            whiff_count: 0,
            is_strikeout: false,
            max_abs_delta_run_exp: 0,
          };
          byAb.set(p.at_bat_number, ab);
        }
        ab.pitch_count += 1;
        if (categorizeDescription(p.description) === "whiff") ab.whiff_count += 1;
        if (p.events && p.events.length > 0 && p.events === "strikeout") {
          ab.is_strikeout = true;
        }
        const dre =
          p.delta_run_exp != null ? Math.abs(Number(p.delta_run_exp)) : 0;
        if (dre > ab.max_abs_delta_run_exp) ab.max_abs_delta_run_exp = dre;
      }

      for (const [abNumber, ab] of byAb) {
        // Composite: one weight per signal so the curated list mixes
        // long whiff sequences, strikeouts, and high-leverage outcomes.
        const score =
          ab.whiff_count * 1.5 +
          (ab.is_strikeout ? 2 : 0) +
          ab.max_abs_delta_run_exp * 5;
        if (score < 1) continue; // skip filler ABs
        notableRows.push({
          game_pk: g.game_pk,
          at_bat_number: abNumber,
          pitcher_id: ab.pitcher_id,
          batter_id: ab.batter_id,
          pitch_count: ab.pitch_count,
          whiff_count: ab.whiff_count,
          is_strikeout: ab.is_strikeout,
          max_abs_delta_run_exp: ab.max_abs_delta_run_exp,
          score,
          game_date: gameDateByPk.get(g.game_pk) ?? cutoffIso,
        });
      }
    }
  }

  // Only wipe the window if we actually finished scanning it — a
  // partial scan followed by a full delete would blank out /daily.
  let written = 0;
  if (!budgetExhausted) {
    await supabase
      .from("pitch_notable_at_bats")
      .delete()
      .gte("game_date", cutoffIso);
  }

  for (let i = 0; i < notableRows.length; i += 200) {
    const chunk = notableRows.slice(i, i + 200);
    const { error } = await supabase.from("pitch_notable_at_bats").upsert(chunk);
    if (error) {
      return NextResponse.json(
        {
          pitch_of_day: pitchOfDay,
          whiff_of_week: whiffOfWeek,
          notable_error: error.message,
          notable_written: written,
        },
        { status: 500 },
      );
    }
    written += chunk.length;
  }

  return NextResponse.json({
    game_date: yesterdayET,
    games_scheduled: scheduledYesterday,
    games_cached: cachedYesterday,
    incomplete_coverage: incompleteCoverage,
    whiff_candidates_scanned: potdRows.length,
    whiff_of_week_computed: isMondayET,
    whiff_of_week_error: wowErr,
    notable_games_scanned: games.length,
    notable_written: written,
    notable_partial: budgetExhausted,
    elapsed_ms: Date.now() - startedAt,
    pitch_of_day: pitchOfDay,
    whiff_of_week: whiffOfWeek,
  });
}
