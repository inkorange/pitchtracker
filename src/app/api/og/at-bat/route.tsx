import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { fetchPersonsCached } from "@/lib/statsapi/client";
import { getPitchColor, categorizeDescription, OUTCOME_COLORS } from "@/lib/viz/colors";

export const runtime = "nodejs";

// Open-graph image for shared /at-bat URLs.
//   /api/og/at-bat?gamePk=NNN&atBatNumber=NN
// Returns a 1200x630 PNG: pitcher → batter card, game date, every
// pitch in the AB rendered as a colored dot row (pitch type color
// with an outcome-colored ring), final result.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const gamePk = Number(url.searchParams.get("gamePk"));
  const atBatNumber = Number(url.searchParams.get("atBatNumber"));

  if (!Number.isFinite(gamePk) || !Number.isFinite(atBatNumber)) {
    return new ImageResponse(<Fallback />, { width: 1200, height: 630 });
  }

  const supabase = await createClient();
  const { data: pitchesRaw } = await supabase
    .from("pitch_game_pitches")
    .select(
      "pitch_number, pitch_type, description, events, balls, strikes, pitcher_id, batter_id, release_speed",
    )
    .eq("game_pk", gamePk)
    .eq("at_bat_number", atBatNumber)
    .order("pitch_number", { ascending: true });

  const pitches = pitchesRaw ?? [];
  if (pitches.length === 0) {
    return new ImageResponse(<Fallback />, { width: 1200, height: 630 });
  }

  const first = pitches[0];
  const last = pitches[pitches.length - 1];
  const pitcherId = first.pitcher_id;
  const batterId = first.batter_id;

  const [{ data: game }, { data: pitcher }, batterMap] = await Promise.all([
    supabase
      .from("pitch_games")
      .select("game_date, home_team_id, away_team_id")
      .eq("game_pk", gamePk)
      .maybeSingle(),
    pitcherId
      ? supabase
          .from("pitch_pitchers")
          .select("full_name")
          .eq("mlb_id", pitcherId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    batterId ? fetchPersonsCached([batterId]) : Promise.resolve(new Map()),
  ]);

  const teamIds = [game?.home_team_id, game?.away_team_id].filter(
    (id): id is number => typeof id === "number",
  );
  const { data: teamRows } =
    teamIds.length > 0
      ? await supabase
          .from("pitch_teams")
          .select("mlb_id, abbreviation")
          .in("mlb_id", teamIds)
      : { data: [] };
  const abbrevById = new Map(
    (teamRows ?? []).map((t) => [t.mlb_id, t.abbreviation]),
  );
  const matchup = `${game?.away_team_id ? abbrevById.get(game.away_team_id) ?? "?" : "?"} @ ${
    game?.home_team_id ? abbrevById.get(game.home_team_id) ?? "?" : "?"
  }`;

  const pitcherName = pitcher?.full_name ?? `Pitcher #${pitcherId ?? "?"}`;
  const batterName = batterId
    ? batterMap.get(batterId)?.fullName ?? `Batter #${batterId}`
    : "—";
  const finalEvent =
    pitches
      .map((p) => p.events)
      .filter((e): e is string => typeof e === "string" && e.length > 0)
      .pop() ?? null;
  const finalLabel = finalEvent
    ? finalEvent
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : last.description ?? "—";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0e14",
          color: "#e8eaed",
          fontFamily: "Geist, system-ui, sans-serif",
          padding: "60px 70px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              fontSize: 18,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            At-bat replay · {matchup} · {game?.game_date ?? ""}
          </div>
          <div style={{ fontSize: 56, fontWeight: 600, lineHeight: 1.05 }}>
            {pitcherName}
          </div>
          <div style={{ fontSize: 28, color: "rgba(255,255,255,0.65)" }}>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>vs</span>{" "}
            {batterName}
          </div>
        </div>

        {/* Pitch sequence: one dot per pitch, fill = pitch type color,
            ring = outcome category. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {pitches.map((p) => {
            const fill = getPitchColor(p.pitch_type ?? "");
            const ring = OUTCOME_COLORS[categorizeDescription(p.description)];
            return (
              <div
                key={p.pitch_number}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    background: fill,
                    boxShadow: `0 0 0 6px ${ring}`,
                  }}
                />
                <div
                  style={{
                    fontSize: 16,
                    fontVariantNumeric: "tabular-nums",
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  P{p.pitch_number}
                  {p.release_speed
                    ? ` · ${Number(p.release_speed).toFixed(0)}`
                    : ""}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <div
            style={{
              fontSize: 18,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            PitchTracker
          </div>
          <div style={{ fontSize: 36, fontWeight: 600 }}>{finalLabel}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

function Fallback() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0e14",
        color: "#e8eaed",
        fontSize: 48,
        fontFamily: "Geist, system-ui, sans-serif",
      }}
    >
      PitchTracker · at-bat replay
    </div>
  );
}
