import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGamePitches } from "@/lib/savant/client";
import type { TablesInsert } from "@/lib/supabase/types";

export const maxDuration = 60;

const FRESHNESS_DAYS = 7;

// Hybrid fetcher: returns cached pitches for a game from pitch_game_pitches
// if present and fresh; otherwise pulls from Savant CSV, writes to Supabase,
// and returns. Fresh = fetched_at is within FRESHNESS_DAYS of game_date,
// to allow Statcast retroactive corrections.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const gamePkParam = url.searchParams.get("gamePk");
  const pitcherIdParam = url.searchParams.get("pitcherId");

  if (!gamePkParam) {
    return NextResponse.json({ error: "gamePk required" }, { status: 400 });
  }
  const gamePk = Number(gamePkParam);
  const pitcherId = pitcherIdParam ? Number(pitcherIdParam) : null;

  const supabase = createAdminClient();

  const { data: cached, error: cacheErr } = await supabase
    .from("pitch_game_pitches")
    .select("*")
    .eq("game_pk", gamePk);
  if (cacheErr) {
    return NextResponse.json({ error: cacheErr.message }, { status: 500 });
  }

  let pitches = cached ?? [];
  if (pitches.length === 0 || isStale(pitches[0]?.fetched_at)) {
    const fresh = await fetchGamePitches(gamePk);
    if (fresh.length > 0) {
      // Get the known pitcher IDs once so we can null out FK-violating rows
      // for opposing-team pitchers we don't have metadata for yet.
      const { data: knownPitchers } = await supabase
        .from("pitch_pitchers")
        .select("mlb_id");
      const knownPitcherIds = new Set((knownPitchers ?? []).map((p) => p.mlb_id));

      const rows: TablesInsert<"pitch_game_pitches">[] = fresh.map((p) => ({
        game_pk: p.game_pk,
        at_bat_number: p.at_bat_number,
        pitch_number: p.pitch_number,
        pitcher_id: knownPitcherIds.has(p.pitcher) ? p.pitcher : null,
        batter_id: p.batter,
        pitch_type: p.pitch_type ?? null,
        pitch_name: p.pitch_name ?? null,
        description: p.description ?? null,
        events: p.events ?? null,
        balls: p.balls,
        strikes: p.strikes,
        outs_when_up: p.outs_when_up,
        inning: p.inning,
        inning_topbot: p.inning_topbot,
        stand: (p as unknown as { stand?: string }).stand ?? null,
        p_throws: (p as unknown as { p_throws?: string }).p_throws ?? null,
        on_1b: p.on_1b,
        on_2b: p.on_2b,
        on_3b: p.on_3b,
        release_pos_x: p.release_pos_x,
        release_pos_y: p.release_pos_y,
        release_pos_z: p.release_pos_z,
        vx0: p.vx0,
        vy0: p.vy0,
        vz0: p.vz0,
        ax: p.ax,
        ay: p.ay,
        az: p.az,
        plate_x: p.plate_x,
        plate_z: p.plate_z,
        release_speed: p.release_speed,
        release_spin_rate: p.release_spin_rate ?? null,
        spin_axis: p.spin_axis ?? null,
        pfx_x: p.pfx_x ?? null,
        pfx_z: p.pfx_z ?? null,
        effective_speed: p.effective_speed,
        release_extension: p.release_extension,
        delta_run_exp: p.delta_run_exp,
        delta_home_win_exp: p.delta_home_win_exp,
      }));
      const { error: upsertErr } = await supabase
        .from("pitch_game_pitches")
        .upsert(rows);
      if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });
      }
      pitches = await supabase
        .from("pitch_game_pitches")
        .select("*")
        .eq("game_pk", gamePk)
        .then((r) => r.data ?? []);
    }
  }

  if (pitcherId !== null) {
    pitches = pitches.filter((p) => p.pitcher_id === pitcherId);
  }

  return NextResponse.json({ pitches }, { headers: { "cache-control": "public, max-age=300" } });
}

function isStale(fetchedAt: string | undefined): boolean {
  if (!fetchedAt) return true;
  const fetched = new Date(fetchedAt);
  const ageMs = Date.now() - fetched.getTime();
  return ageMs > FRESHNESS_DAYS * 24 * 60 * 60 * 1000;
}
