import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getPitchColor, getPitchColorForSide } from "@/lib/viz/colors";

export const runtime = "nodejs";

// Open-graph image for shared /compare URLs.
//   /api/og/compare?a=NNN&b=NNN&aSeason=YYYY&bSeason=YYYY
// Returns a 1200x630 PNG with both pitchers' headshots, names, and
// arsenal swatches. ImageResponse runs server-side using a subset of
// React + CSS (no Three.js), so this is a static-feeling card rather
// than a rendered 3D scene.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const aId = Number(url.searchParams.get("a"));
  const bId = Number(url.searchParams.get("b"));
  const currentYear = new Date().getFullYear();
  const aSeason = Number(url.searchParams.get("aSeason")) || currentYear;
  const bSeason = Number(url.searchParams.get("bSeason")) || currentYear;

  if (!Number.isFinite(aId) || !Number.isFinite(bId)) {
    return new ImageResponse(<Fallback />, { width: 1200, height: 630 });
  }

  const supabase = await createClient();
  const [{ data: aPitcher }, { data: bPitcher }] = await Promise.all([
    supabase
      .from("pitch_pitchers")
      .select("mlb_id, full_name, throws")
      .eq("mlb_id", aId)
      .maybeSingle(),
    supabase
      .from("pitch_pitchers")
      .select("mlb_id, full_name, throws")
      .eq("mlb_id", bId)
      .maybeSingle(),
  ]);

  if (!aPitcher || !bPitcher) {
    return new ImageResponse(<Fallback />, { width: 1200, height: 630 });
  }

  const [{ data: aAgg }, { data: bAgg }] = await Promise.all([
    supabase
      .from("pitch_pitcher_aggregates")
      .select("pitch_type, usage_pct")
      .eq("pitcher_id", aId)
      .eq("season", aSeason)
      .eq("batter_hand", "*")
      .gt("pitch_count", 0)
      .order("usage_pct", { ascending: false, nullsFirst: false })
      .limit(5),
    supabase
      .from("pitch_pitcher_aggregates")
      .select("pitch_type, usage_pct")
      .eq("pitcher_id", bId)
      .eq("season", bSeason)
      .eq("batter_hand", "*")
      .gt("pitch_count", 0)
      .order("usage_pct", { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  const headshotA = headshotUrl(aId);
  const headshotB = headshotUrl(bId);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0a0e14",
          color: "#e8eaed",
          fontFamily: "Geist, system-ui, sans-serif",
          padding: "60px 70px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 18,
            color: "#7a8694",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 30,
          }}
        >
          <span>PitchTracker</span>
          <span>compare</span>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 60 }}>
          <PitcherSide
            side="a"
            name={aPitcher.full_name}
            throws={aPitcher.throws}
            season={aSeason}
            headshot={headshotA}
            arsenal={(aAgg ?? []).map((a) => a.pitch_type)}
          />
          <div
            style={{
              fontSize: 80,
              color: "#7a8694",
              fontWeight: 200,
              alignSelf: "center",
            }}
          >
            vs
          </div>
          <PitcherSide
            side="b"
            name={bPitcher.full_name}
            throws={bPitcher.throws}
            season={bSeason}
            headshot={headshotB}
            arsenal={(bAgg ?? []).map((a) => a.pitch_type)}
          />
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

function PitcherSide({
  side,
  name,
  throws,
  season,
  headshot,
  arsenal,
}: {
  side: "a" | "b";
  name: string;
  throws: string | null;
  season: number;
  headshot: string;
  arsenal: string[];
}) {
  const colorFn = side === "a" ? getPitchColor : (t: string) => getPitchColorForSide(t, "b");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        alignItems: "center",
        gap: 18,
      }}
    >
      {/* next/image doesn't run inside Next.js OG ImageResponse; native <img> is required. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={headshot}
        width={170}
        height={170}
        style={{
          borderRadius: 999,
          objectFit: "cover",
          border: "2px solid rgba(255,255,255,0.1)",
        }}
        alt=""
      />
      <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>
        {name}
      </div>
      <div style={{ fontSize: 18, color: "#7a8694", letterSpacing: 2 }}>
        {throws ? `${throws}HP · ` : ""}
        {season}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        {arsenal.map((pt) => (
          <div
            key={pt}
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              background: colorFn(pt),
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Fallback() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#0a0e14",
        color: "#e8eaed",
        fontFamily: "Geist, system-ui, sans-serif",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <div style={{ fontSize: 60, fontWeight: 600 }}>PitchTracker</div>
      <div style={{ fontSize: 20, color: "#7a8694", letterSpacing: 4, textTransform: "uppercase" }}>
        compare two pitchers in 3D
      </div>
    </div>
  );
}

function headshotUrl(mlbId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_360,q_auto:best/v1/people/${mlbId}/headshot/67/current`;
}
