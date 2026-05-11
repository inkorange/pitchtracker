import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensurePitcherSeasonCache } from "@/lib/cache/backfill";
import { categorizeDescription, type OutcomeCategory } from "@/lib/viz/colors";

// JSON arsenal endpoint backing the persistent Scene shell on the
// pitcher route. Mirrors the pitch-fetch + filter logic that lived
// inline in /pitcher/[id]/page.tsx, returning only what the 3D Scene
// needs (renderable pitches + display label) so the layout-level
// Scene can refresh on URL change without remounting the Canvas.

interface ArsenalParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: ArsenalParams) {
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

  const supabase = await createClient();

  // Same lazy backfill as page.tsx: first visit per pitcher × season
  // pulls from Savant before the SELECT below sees an empty cache.
  await ensurePitcherSeasonCache(pitcherId, season);

  const [{ data: pitcher }, { data: pitchesRaw }] = await Promise.all([
    supabase
      .from("pitch_pitchers")
      .select("mlb_id, full_name, last_name")
      .eq("mlb_id", pitcherId)
      .maybeSingle(),
    (() => {
      let q = supabase
        .from("pitch_game_pitches")
        .select(
          "game_pk, at_bat_number, pitch_number, pitch_type, stand, description, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension, pitch_games!inner(season, game_type)",
        )
        .eq("pitcher_id", pitcherId)
        .eq("pitch_games.season", season)
        .eq("pitch_games.game_type", "R")
        .range(0, 4999);
      if (hand === "L" || hand === "R") q = q.eq("stand", hand);
      if (game) q = q.eq("game_pk", Number(game));
      return q;
    })(),
  ]);

  if (!pitcher) {
    return NextResponse.json({ error: "Pitcher not found" }, { status: 404 });
  }

  const cached = pitchesRaw ?? [];
  const outcomes = outcomesParam
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is OutcomeCategory =>
      ["whiff", "called", "ball", "foul", "inplay", "other"].includes(s),
    );
  const outcomeSet = new Set(outcomes);
  const arsenal = cached.filter(
    (p) => outcomeSet.size === 0 || outcomeSet.has(categorizeDescription(p.description)),
  );
  const pitchTypes = pitchTypesParam.split(",").filter(Boolean);
  const pitchTypeSet = new Set(pitchTypes);
  const filtered =
    pitchTypeSet.size === 0
      ? arsenal
      : arsenal.filter((p) => p.pitch_type != null && pitchTypeSet.has(p.pitch_type));
  const renderable = filtered.filter(
    (p) => p.vx0 != null && p.vy0 != null && p.vz0 != null,
  );

  return NextResponse.json(
    {
      pitches: renderable,
      pitcherLabel: pitcherLastName(pitcher),
    },
    {
      headers: {
        "cache-control": "public, max-age=60, s-maxage=60",
      },
    },
  );
}

function pitcherLastName(p: { full_name: string; last_name?: string | null }): string {
  if (p.last_name && p.last_name.trim().length > 0) return p.last_name;
  const parts = p.full_name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? p.full_name;
}
