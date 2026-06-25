import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { categorizeDescription } from "@/lib/viz/colors";
import type { TablesInsert } from "@/lib/supabase/types";

export const maxDuration = 60;

// Score every at-bat in the last N days (default 7) and persist the
// composite score to pitch_notable_at_bats. Then pick one Pitch of the
// Day (from the last 24h) and one Whiff of the Week (rolling 7-day) and
// upsert into pitch_daily_features.
//
// Only runs over already-cached pitches — we don't pull anything new
// from Savant here. Backfilling cached pitches is the job of the
// per-page lazy fetch and the future cron-driven backfill.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const lookbackDays = Number(url.searchParams.get("days") ?? "7");
  const supabase = createAdminClient();

  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  // Compute "yesterday in MLB-local time" — the strict window we use
  // to pick Pitch of the Day. Doing it in ET means a 7:30am ET cron
  // run (11:30 UTC) consistently looks back at "last night's games"
  // regardless of UTC date rollover quirks.
  //
  // Also derives day-of-week so we can gate Whiff of the Week to a
  // single weekly refresh (Mondays). Mid-week WoW updates created
  // noise — the "best whiff of the week" shouldn't change daily.
  const etDateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayET = etDateFormatter.format(today); // "YYYY-MM-DD"
  const [etYear, etMonth, etDay] = todayET.split("-").map(Number);
  const todayEtUtc = new Date(Date.UTC(etYear, etMonth - 1, etDay));
  const yesterdayEtUtc = new Date(todayEtUtc);
  yesterdayEtUtc.setUTCDate(yesterdayEtUtc.getUTCDate() - 1);
  const yesterdayET = yesterdayEtUtc.toISOString().slice(0, 10);
  const isMondayET = todayEtUtc.getUTCDay() === 1; // 0=Sun, 1=Mon

  // Source the iteration from pitch_pitcher_games rather than from
  // pitch_games directly — pitch_games holds the full schedule
  // (current + future + historical) and gte(game_date, cutoff) can
  // easily exceed PostgREST's 1000-row cap with thousands of
  // upcoming-schedule rows. pitch_pitcher_games is bounded to
  // *actually-cached* games but, at 15 games/day × ~12 pitchers/game
  // × 7-day window, still pushes ~1,260 rows — above Supabase's hard
  // 1000-row server-side cap. Paginate by primary-key order so we
  // catch the most-recent rows that otherwise get dropped (which
  // would silently mask yesterday's games and freeze the POTD pick).
  type PpgJoinRow = {
    game_pk: number;
    pitch_games: { game_date: string };
  };
  const PPG_PAGE_SIZE = 1000;
  const PPG_MAX_PAGES = 20;
  const gameDateByPk = new Map<number, string>();
  for (let page = 0; page < PPG_MAX_PAGES; page++) {
    const { data: pageRows, error: pageErr } = await supabase
      .from("pitch_pitcher_games")
      .select("game_pk, pitch_games!inner(game_date)")
      .gte("pitch_games.game_date", cutoffIso)
      .order("game_pk", { ascending: true })
      .range(page * PPG_PAGE_SIZE, (page + 1) * PPG_PAGE_SIZE - 1);
    if (pageErr) {
      console.error("[refresh-notable-at-bats] ppg page", page, pageErr);
      return NextResponse.json({ error: pageErr.message }, { status: 500 });
    }
    const rows = (pageRows ?? []) as unknown as PpgJoinRow[];
    for (const r of rows) {
      if (!gameDateByPk.has(r.game_pk)) {
        gameDateByPk.set(r.game_pk, r.pitch_games.game_date);
      }
    }
    if (rows.length < PPG_PAGE_SIZE) break;
  }
  const games = Array.from(gameDateByPk, ([game_pk, game_date]) => ({
    game_pk,
    game_date,
  })).sort((a, b) => b.game_date.localeCompare(a.game_date));

  // For each game, pull every pitch and bucket by at_bat_number.
  // Per-game queries stay small (~280 pitches per game), well under the
  // 1500-row limit we use elsewhere.
  type AbAccumulator = {
    pitcher_id: number | null;
    batter_id: number | null;
    pitch_count: number;
    whiff_count: number;
    is_strikeout: boolean;
    max_abs_delta_run_exp: number;
    last_event: string | null;
    // Track the most outcome-defining pitch for daily-feature selection.
    best_whiff: { pitch_number: number; velocity: number } | null;
  };

  const notableRows: TablesInsert<"pitch_notable_at_bats">[] = [];
  type FeaturePick = {
    game_pk: number;
    at_bat_number: number;
    pitch_number: number;
    pitcher_id: number | null;
    batter_id: number | null;
    score: number;
    reason: string;
    feature_date: string;
  };
  let pitchOfDay: FeaturePick | null = null;
  let whiffOfWeek: FeaturePick | null = null;

  const todayIso = today.toISOString().slice(0, 10);
  // Pitch of the Day picks STRICTLY from yesterday's MLB games (in ET).
  // The earlier "most recent cached game date" fallback would happily
  // re-select the same pitch from a 2-day-old game when yesterday's
  // ingestion hadn't landed yet, freezing the daily feature for days
  // at a stretch. Strict yesterday means: if yesterday had no MLB
  // games (off-day, All-Star break) OR Savant hasn't ingested them
  // by the 11:30 UTC cron, pitchOfDay stays null and the upsert below
  // is skipped — DailyPickStrip keeps the previous day's pick visible.

  for (const g of games) {
    const { data: pitchesRaw } = await supabase
      .from("pitch_game_pitches")
      .select(
        "at_bat_number, pitch_number, pitcher_id, batter_id, description, events, delta_run_exp, release_speed",
      )
      .eq("game_pk", g.game_pk)
      .range(0, 1499);
    const pitches = pitchesRaw ?? [];
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
          last_event: null,
          best_whiff: null,
        };
        byAb.set(p.at_bat_number, ab);
      }
      ab.pitch_count += 1;
      const cat = categorizeDescription(p.description);
      if (cat === "whiff") {
        ab.whiff_count += 1;
        const vel = Number(p.release_speed ?? 0);
        if (!ab.best_whiff || vel > ab.best_whiff.velocity) {
          ab.best_whiff = { pitch_number: p.pitch_number, velocity: vel };
        }
      }
      if (p.events && p.events.length > 0) {
        ab.last_event = p.events;
        if (p.events === "strikeout") ab.is_strikeout = true;
      }
      const dre = p.delta_run_exp != null ? Math.abs(Number(p.delta_run_exp)) : 0;
      if (dre > ab.max_abs_delta_run_exp) ab.max_abs_delta_run_exp = dre;

      // Pitch-of-day candidate: best-velocity whiff from yesterday's
      // games specifically. Strict date filter means each day's pool
      // is non-overlapping with the previous day's, so the same pitch
      // can't be picked twice across consecutive runs.
      if (
        cat === "whiff" &&
        g.game_date === yesterdayET &&
        p.release_speed != null
      ) {
        const score = Number(p.release_speed);
        if (!pitchOfDay || score > pitchOfDay.score) {
          pitchOfDay = {
            game_pk: g.game_pk,
            at_bat_number: p.at_bat_number,
            pitch_number: p.pitch_number,
            pitcher_id: p.pitcher_id,
            batter_id: p.batter_id,
            score,
            reason: `${score.toFixed(1)} mph swinging strike`,
            feature_date: todayIso,
          };
        }
      }

      // Whiff-of-week candidate: highest-velocity whiff in the 7-day
      // lookback. Only computed when this cron run is the weekly
      // refresh (Mondays) — daily WoW updates produce noisy week-over-
      // week jitter where a single high-velo pitch reshuffles the
      // headline every morning. On non-Monday runs we leave the
      // existing WoW row in place via the `if (whiffOfWeek)` guard
      // around the upsert below.
      if (isMondayET && cat === "whiff" && p.release_speed != null) {
        const score = Number(p.release_speed);
        if (!whiffOfWeek || score > whiffOfWeek.score) {
          whiffOfWeek = {
            game_pk: g.game_pk,
            at_bat_number: p.at_bat_number,
            pitch_number: p.pitch_number,
            pitcher_id: p.pitcher_id,
            batter_id: p.batter_id,
            score,
            reason: `${score.toFixed(1)} mph whiff (${gameDateByPk.get(g.game_pk) ?? ""})`,
            feature_date: todayIso,
          };
        }
      }
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

  // Wipe the rolling window before re-inserting so retired ABs don't
  // linger. The PK is (game_pk, at_bat_number) so upsert alone wouldn't
  // remove ABs that fell out of the window.
  await supabase
    .from("pitch_notable_at_bats")
    .delete()
    .gte("game_date", cutoffIso);

  let written = 0;
  for (let i = 0; i < notableRows.length; i += 200) {
    const chunk = notableRows.slice(i, i + 200);
    const { error } = await supabase
      .from("pitch_notable_at_bats")
      .upsert(chunk);
    if (error) {
      return NextResponse.json(
        { error: error.message, written },
        { status: 500 },
      );
    }
    written += chunk.length;
  }

  // Daily feature picks. Upsert keyed by (kind, date) so each calendar
  // day has at most one of each.
  const featureRows: TablesInsert<"pitch_daily_features">[] = [];
  if (pitchOfDay) {
    featureRows.push({
      feature_kind: "pitch_of_the_day",
      feature_date: pitchOfDay.feature_date,
      game_pk: pitchOfDay.game_pk,
      at_bat_number: pitchOfDay.at_bat_number,
      pitch_number: pitchOfDay.pitch_number,
      pitcher_id: pitchOfDay.pitcher_id,
      batter_id: pitchOfDay.batter_id,
      reason: pitchOfDay.reason,
    });
  }
  if (whiffOfWeek) {
    featureRows.push({
      feature_kind: "whiff_of_the_week",
      feature_date: whiffOfWeek.feature_date,
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
      .upsert(featureRows);
    if (featErr) {
      return NextResponse.json(
        { error: featErr.message, written },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    games_scanned: games.length,
    notable_written: written,
    pitch_of_day: pitchOfDay,
    whiff_of_week: whiffOfWeek,
  });
}
