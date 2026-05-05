import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPitcherAggregates } from "@/lib/savant/client";

export const maxDuration = 300;

// Refreshes pitch_pitcher_aggregates for the requested season. Walks every
// pitcher in pitch_pitchers and pulls their player-services arsenal data
// from Savant. Without batter-hand splits for now (Savant exposes them
// via separate query params; we'll add splits in a follow-up).
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const season = Number(url.searchParams.get("season")) || new Date().getFullYear();
  const limit = Number(url.searchParams.get("limit")) || 0;

  const supabase = createAdminClient();
  const { data: pitchers, error: pitcherErr } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id");
  if (pitcherErr) {
    return NextResponse.json({ error: pitcherErr.message }, { status: 500 });
  }
  if (!pitchers || pitchers.length === 0) {
    return NextResponse.json(
      { error: "No pitchers in pitch_pitchers. Run refresh-pitchers first." },
      { status: 400 },
    );
  }

  const list = limit > 0 ? pitchers.slice(0, limit) : pitchers;

  const rows: Array<{
    pitcher_id: number;
    season: number;
    pitch_type: string;
    batter_hand: string;
    pitch_count: number | null;
    usage_pct: number | null;
    avg_velocity: number | null;
    avg_spin_rate: number | null;
    avg_vertical_break: number | null;
    avg_horizontal_break: number | null;
    avg_induced_vertical_break: number | null;
    whiff_rate: number | null;
    called_strike_rate: number | null;
    run_value_per_100: number | null;
    batting_avg_against: number | null;
    updated_at: string;
  }> = [];

  for (const p of list) {
    let arsenal;
    try {
      arsenal = await fetchPitcherAggregates(p.mlb_id, season);
    } catch {
      continue;
    }
    for (const a of arsenal) {
      if (!a.pitch_type) continue;
      rows.push({
        pitcher_id: p.mlb_id,
        season,
        pitch_type: a.pitch_type,
        batter_hand: "*",
        pitch_count: a.pitches ?? null,
        usage_pct: a.pitch_usage ?? null,
        avg_velocity: a.velocity ?? null,
        avg_spin_rate: a.spin_rate ?? null,
        avg_vertical_break: a.v_break ?? null,
        avg_horizontal_break: a.h_break ?? null,
        avg_induced_vertical_break: a.ivb ?? null,
        whiff_rate: a.whiff_percent ?? null,
        called_strike_rate: null, // not in player-services; computed elsewhere
        run_value_per_100: a.run_value_per_100 ?? null,
        batting_avg_against: a.ba ?? null,
        updated_at: new Date().toISOString(),
      });
    }
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from("pitch_pitcher_aggregates").upsert(chunk);
    if (error) {
      return NextResponse.json(
        { error: error.message, written },
        { status: 500 },
      );
    }
    written += chunk.length;
  }

  return NextResponse.json({ season, refreshed: written });
}
