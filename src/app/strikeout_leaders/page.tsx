import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";

// Screenshot-target page captured by the external X.com weekly
// scheduler skill. Render is fixed at 1080×1350 (Twitter's max-real-
// estate portrait image ratio) so the skill can set a deterministic
// viewport and grab the whole leaderboard in one shot.
//
// Notes for the skill side:
//   - Path: /strikeout_leaders (no params; always serves the active
//     season's top 10).
//   - Viewport for capture: 1080×1350.
//   - SiteFooter + AiChat hide themselves on this path via
//     isScreenshotRoute() in src/lib/url/screenshot-routes.ts.
//   - Cache: edge-cached for 1 hour with 24-hour SWR (see
//     next.config.ts) — the strikeouts ranking only changes once a
//     day via the refresh-rankings cron, so a stale-cache hit is
//     fine and keeps the skill's screenshot run cheap.

export const metadata: Metadata = {
  title: "MLB Strikeout Leaders · pitchtracker",
  description:
    "Top 10 MLB strikeout leaders for the current season — generated from live Statcast data, refreshed daily.",
  // Don't index the screenshot target itself — Google should land
  // viewers on the homepage or pitcher pages, not on a chrome-less
  // bare leaderboard. Indexing it would also dilute the homepage
  // rankings strip's SEO position.
  robots: { index: false, follow: false },
};

interface LeaderboardRow {
  rank: number;
  pitcher_id: number;
  full_name: string;
  throws: string | null;
  team_id: number | null;
  team_abbr: string | null;
  team_name: string | null;
  strikeouts: number;
}

async function loadStrikeoutLeaders(): Promise<LeaderboardRow[]> {
  const season = new Date().getFullYear();
  const supabase = await createClient();
  const { data: rankRows, error: rankErr } = await supabase.rpc(
    "pitch_top_strikeouts",
    { p_season: season, p_limit: 10 },
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
      strikeouts: r.strikeouts,
    };
  });
}

function handLabel(throws: string | null): string {
  if (throws === "L") return "LHP";
  if (throws === "R") return "RHP";
  return "";
}

export default async function StrikeoutLeadersPage() {
  const season = new Date().getFullYear();
  const rows = await loadStrikeoutLeaders();

  return (
    // Fixed 1080×1350 canvas so the screenshot is deterministic. The
    // outer flex centers it within the browser viewport for human
    // preview; the skill uses a 1080×1350 headless viewport so the
    // outer padding effectively collapses to zero.
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
              "radial-gradient(circle at 15% 10%, rgba(95, 199, 216, 0.18), transparent 45%), radial-gradient(circle at 85% 90%, rgba(180, 95, 240, 0.16), transparent 45%)",
          }}
        />

        {/* Header */}
        <header className="relative z-10 px-12 pt-12 pb-6 border-b border-white/[0.08]">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[14px] uppercase tracking-[0.32em] text-white/45">
                Top 10
              </div>
              <h1 className="mt-2 text-[60px] leading-[1.04] font-semibold tracking-tight">
                MLB Strikeout Leaders
              </h1>
              <div className="mt-3 text-[18px] text-white/55 tabular-nums">
                {season} Regular Season
              </div>
            </div>
            <div className="text-right">
              <div className="text-[14px] uppercase tracking-[0.18em] text-white/45">
                pitchtracker
              </div>
              <div className="text-[12px] text-white/30 mt-1">
                pitchtracker.chriswest.tech
              </div>
            </div>
          </div>
        </header>

        {/* Leaderboard rows */}
        <ol className="relative z-10 flex-1 px-12 py-6 flex flex-col gap-2">
          {rows.length === 0 ? (
            <li className="text-[24px] text-white/40 italic text-center mt-12">
              No strikeout data for {season} yet.
            </li>
          ) : (
            rows.map((row) => (
              <li
                key={row.pitcher_id}
                className="flex items-center gap-5 px-5 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.07]"
              >
                <span
                  className={`text-[44px] font-semibold w-[68px] tabular-nums text-center ${
                    row.rank === 1
                      ? "text-amber-300"
                      : row.rank <= 3
                        ? "text-white"
                        : "text-white/55"
                  }`}
                >
                  {row.rank}
                </span>
                <div className="relative w-[78px] h-[78px] rounded-full bg-white/[0.05] overflow-hidden flex-shrink-0 border border-white/10">
                  <Image
                    src={pitcherHeadshotUrl(row.pitcher_id, 240)}
                    alt={row.full_name}
                    fill
                    sizes="78px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[28px] font-medium truncate leading-tight">
                    {row.full_name}
                  </div>
                  <div className="text-[16px] text-white/55 tabular-nums mt-1">
                    {row.team_abbr ?? "FA"}
                    {handLabel(row.throws) ? ` · ${handLabel(row.throws)}` : ""}
                  </div>
                </div>
                {row.team_id ? (
                  <div className="relative w-[56px] h-[56px] flex-shrink-0">
                    <Image
                      src={teamLogoUrl(row.team_id)}
                      alt={row.team_name ?? row.team_abbr ?? "team"}
                      fill
                      sizes="56px"
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                ) : null}
                <div className="text-right tabular-nums min-w-[120px]">
                  <div className="text-[44px] leading-none font-semibold">
                    {row.strikeouts}
                  </div>
                  <div className="text-[14px] uppercase tracking-[0.16em] text-white/40 mt-1">
                    K
                  </div>
                </div>
              </li>
            ))
          )}
        </ol>

        {/* Footer */}
        <footer className="relative z-10 px-12 pb-10 pt-4 flex items-end justify-between border-t border-white/[0.06]">
          <div className="text-[13px] text-white/40 leading-snug max-w-[640px]">
            Live MLB Statcast data, refreshed daily. Pitch-by-pitch 3D
            arsenal, movement plots, velocity histograms, and at-bat
            replay for every active pitcher.
          </div>
          <div className="text-[13px] text-white/55 uppercase tracking-[0.18em] text-right">
            pitchtracker
          </div>
        </footer>
      </div>
    </main>
  );
}
