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

  // Source the iteration from pitch_pitcher_games rather than from
  // pitch_games directly — pitch_games holds the full schedule
  // (current + future + historical) and gte(game_date, cutoff) can
  // easily exceed PostgREST's 1000-row cap with thousands of
  // upcoming-schedule rows. pitch_pitcher_games is bounded to
  // *actually-cached* games and stays well under any cap.
  const { data: ppgRows, error: ppgErr } = await supabase
    .from("pitch_pitcher_games")
    .select("game_pk, pitch_games!inner(game_date)")
    .gte("pitch_games.game_date", cutoffIso);
  if (ppgErr) {
    return NextResponse.json({ error: ppgErr.message }, { status: 500 });
  }
  type PpgJoinRow = {
    game_pk: number;
    pitch_games: { game_date: string };
  };
  const ppgJoined = (ppgRows ?? []) as unknown as PpgJoinRow[];
  const gameDateByPk = new Map<number, string>();
  for (const r of ppgJoined) {
    gameDateByPk.set(r.game_pk, r.pitch_games.game_date);
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
  // Pitch of the Day picks from the most recent cached game date
  // rather than strict "today" — if our cache is a day or two behind
  // (offseason, scheduled refresh hasn't run, etc.), the surface
  // should still populate with the freshest pitches we have.
  const latestCachedDate = games[0]?.game_date ?? todayIso;

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

      // Pitch-of-day candidate: best-velocity whiff from the most
      // recent cached game date. Picks a single defining pitch.
      if (
        cat === "whiff" &&
        g.game_date === latestCachedDate &&
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

      // Whiff-of-week candidate: any whiff in the lookback window,
      // ranked by velocity. Tracks separately so the rolling weekly
      // pick survives even when the daily pick rolls over.
      if (cat === "whiff" && p.release_speed != null) {
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
