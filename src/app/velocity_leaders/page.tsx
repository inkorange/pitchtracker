import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";

// Screenshot-target page captured by the external X.com weekly
// scheduler skill. Same 1080×1350 canvas as /strikeout_leaders so the
// skill can reuse its viewport config; structurally a clone with the
// metric swapped from season strikeouts to 7-day avg fastball velocity.
//
// Why the rolling 7-day window instead of season-to-date avg:
// season-wide velo flattens out and ends up dominated by the same 8-10
// hardest-throwing starters every week, so the weekly post would have
// stale names. A 7-day window surfaces flame-throwing relievers
// (Mason Miller, Munoz, Henriquez) who only pitch 2-3 times a week —
// they wouldn't move a season average but they're exactly the names
// that go viral on baseball Twitter.
//
// Min-pitches gate (default 20 in the RPC) keeps mop-up appearances
// from spiking the leaderboard with a 6-fastball sample at 101.
//
// Notes for the skill side:
//   - Path: /velocity_leaders (no params; rolling 7-day window).
//   - Viewport for capture: 1080×1350 (same as strikeout_leaders).
//   - Cache: edge-cached for 1 hour with 24-hour SWR (see
//     next.config.ts) — pitch data refreshes daily via the
//     refresh-aggregates cron.

export const metadata: Metadata = {
  title: "MLB Fastball Velocity Leaders · PitchTracker",
  description:
    "Top 10 MLB pitchers by average fastball velocity over the last 7 days — live Statcast data, refreshed daily.",
  // Don't index the screenshot target itself — Google should land
  // viewers on the homepage or pitcher pages, not on a chrome-less
  // bare leaderboard.
  robots: { index: false, follow: false },
};

// ISR revalidate: hold the pre-rendered HTML for 1 hour before the
// next background regeneration. The underlying pitch_top_velocity_7d
// materialized view is refreshed once per day by refresh-rankings
// (see /api/cron/refresh-rankings), so hourly is far more than fresh
// enough for the visible list. Every additional CDN cache hit here
// is one fewer Supabase RPC call — combined with the MV migration
// this is the multiplier that gets the Disk IO cost down to near-zero.
export const revalidate = 3600;

interface LeaderboardRow {
  rank: number;
  pitcher_id: number;
  full_name: string;
  throws: string | null;
  team_id: number | null;
  team_abbr: string | null;
  team_name: string | null;
  avg_velo: number;
  fb_pitches: number;
}

async function loadVelocityLeaders(): Promise<LeaderboardRow[]> {
  const supabase = await createClient();
  const { data: rankRows, error: rankErr } = await supabase.rpc(
    "pitch_top_velocity",
    { p_days: 7, p_limit: 10, p_min_pitches: 20 },
  );
  if (rankErr || !rankRows || rankRows.length === 0) return [];

  const pitcherIds = rankRows.map((r) => r.pitcher_id);
  const { data: pitcherRows } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id, full_name, throws, current_team_id")
    .in("mlb_id", pitcherIds);
  const pitcherById = new Map(
    (pitcherRows ?? []).map((p) => [p.mlb_id, p]),
  );
  const teamIds = Array.from(
    new Set(
      (pitcherRows ?? [])
        .map((p) => p.current_team_id)
        .filter((id): id is number => id != null),
    ),
  );
  const { data: teamRows } =
    teamIds.length > 0
      ? await supabase
          .from("pitch_teams")
          .select("mlb_id, name, abbreviation")
          .in("mlb_id", teamIds)
      : { data: [] };
  const teamById = new Map(
    (teamRows ?? []).map((t) => [t.mlb_id, t]),
  );

  return rankRows.map((r) => {
    const p = pitcherById.get(r.pitcher_id);
    const t = p?.current_team_id ? teamById.get(p.current_team_id) : null;
    return {
      rank: r.rank,
      pitcher_id: r.pitcher_id,
      full_name: p?.full_name ?? `Pitcher #${r.pitcher_id}`,
      throws: p?.throws ?? null,
      team_id: p?.current_team_id ?? null,
      team_abbr: t?.abbreviation ?? null,
      team_name: t?.name ?? null,
      avg_velo: Number(r.avg_velo),
      fb_pitches: r.fb_pitches,
    };
  });
}

function handLabel(throws: string | null): string {
  if (throws === "L") return "LHP";
  if (throws === "R") return "RHP";
  return "";
}

export default async function VelocityLeadersPage() {
  const now = new Date();
  const season = now.getFullYear();
  // The 7-day window is anchored to current_date inside the RPC, but
  // the header label uses ET so the displayed range matches the MLB
  // calendar day boundary the SQL is querying against.
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
    });
  const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const dateRangeLabel = `${fmt(sevenDaysAgo)} – ${fmt(now)}`;
  const rows = await loadVelocityLeaders();

  return (
    <main className="min-h-screen w-full bg-[#040a14] flex items-center justify-center">
      <div
        data-screenshot-target
        className="w-[1080px] h-[1350px] flex flex-col bg-gradient-to-b from-[#0a1226] via-[#0a1428] to-[#040a14] text-white relative overflow-hidden font-sans"
      >
        {/* Subtle radial accents reminiscent of a baseball-card
            background. Purely decorative — keeps the dark canvas from
            reading as a flat black rectangle in the X.com feed. */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-50 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 15% 10%, rgba(255, 145, 95, 0.18), transparent 45%), radial-gradient(circle at 85% 90%, rgba(95, 199, 216, 0.16), transparent 45%)",
          }}
        />

        {/* Header */}
        <header className="relative z-10 px-12 pt-10 pb-4 border-b border-white/[0.08]">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-[18px] font-semibold uppercase tracking-[0.32em] text-white/60">
                Top 10
              </div>
              {/* Two lines via explicit <br/> instead of relying on the
                  browser's wrap point — Playwright captures need a
                  deterministic break so the title doesn't shift
                  between screenshots. Drops from 60px → 52px so the
                  two-line block fits the existing canvas budget
                  without squeezing the row stack. */}
              <h1 className="mt-2 text-[52px] leading-[1.05] font-semibold tracking-tight">
                Weekly MLB Fastball
                <br />
                Velocity Leaders
              </h1>
              <div className="mt-3 text-[18px] text-white/55 tabular-nums">
                {dateRangeLabel} · {season} Regular Season · Avg FB Velo
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <div className="relative w-[260px] h-[45px]">
                <Image
                  src="/pitchtracker-logo.svg"
                  alt="PitchTracker"
                  fill
                  sizes="260px"
                  className="object-contain object-right"
                  unoptimized
                  priority
                />
              </div>
              <div className="text-[12px] text-white/40">
                pitchtracker.chriswest.tech
              </div>
            </div>
          </div>
        </header>

        {/* Leaderboard rows */}
        <ol className="relative z-10 flex-1 px-12 py-4 flex flex-col gap-3">
          {rows.length === 0 ? (
            <li className="text-[24px] text-white/40 italic text-center mt-12">
              No fastball data in the last 7 days.
            </li>
          ) : (
            rows.map((row) => (
              <li
                key={row.pitcher_id}
                className="relative flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.07] overflow-hidden"
              >
                {row.team_id ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute right-[12%] bottom-0 translate-y-[40%] w-[152px] h-[152px] opacity-20"
                  >
                    <Image
                      src={teamLogoUrl(row.team_id)}
                      alt=""
                      fill
                      sizes="152px"
                      // Yankees-only invert — same logic as
                      // /strikeout_leaders. Pure navy NY mark
                      // vanishes against the dark canvas at 20% alpha.
                      className={`object-contain object-bottom ${
                        row.team_id === 147
                          ? "[filter:brightness(0)_invert(1)]"
                          : ""
                      }`}
                      unoptimized
                    />
                  </div>
                ) : null}
                <span
                  className={`relative z-10 text-[36px] font-semibold w-[56px] tabular-nums text-center ${
                    row.rank === 1
                      ? "text-amber-300"
                      : row.rank <= 3
                        ? "text-white"
                        : "text-white/55"
                  }`}
                >
                  {row.rank}
                </span>
                <div className="relative z-10 w-[64px] h-[64px] rounded-full bg-white/[0.05] overflow-hidden flex-shrink-0 border border-white/10">
                  <Image
                    src={pitcherHeadshotUrl(row.pitcher_id, 240)}
                    alt={row.full_name}
                    fill
                    sizes="64px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="relative z-10 flex-1 min-w-0">
                  <div className="text-[24px] font-medium truncate leading-tight">
                    {row.full_name}
                  </div>
                  <div className="text-[15px] text-white/55 tabular-nums mt-0.5">
                    {row.team_abbr ?? "FA"}
                    {handLabel(row.throws) ? ` · ${handLabel(row.throws)}` : ""}
                  </div>
                </div>
                {/* avg_velo is the headline; fb_pitches sample size sits
                    underneath as proof-of-sample so a fastball-light
                    reliever doesn't look like a fluke. */}
                <div className="relative z-10 text-right tabular-nums min-w-[120px]">
                  <div className="text-[42px] leading-none font-semibold">
                    {row.avg_velo.toFixed(1)}
                    <span className="text-[20px] text-white/45 font-medium ml-1">
                      mph
                    </span>
                  </div>
                  <div className="text-[13px] text-white/40 mt-1">
                    {row.fb_pitches} FBs
                  </div>
                </div>
              </li>
            ))
          )}
        </ol>

        {/* Footer */}
        <footer className="relative z-10 px-12 pb-10 pt-4 flex items-end justify-between border-t border-white/[0.06]">
          <div className="text-[13px] text-white/40 leading-snug max-w-[640px]">
            Avg four-seam + sinker velocity over the last 7 days
            (min 20 fastballs). Live MLB Statcast data, refreshed daily.
          </div>
          <div className="text-[13px] text-white/55 uppercase tracking-[0.18em] text-right">
            PitchTracker
          </div>
        </footer>
      </div>
    </main>
  );
}
