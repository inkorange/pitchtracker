import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { fetchPersonsCached } from "@/lib/statsapi/client";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";
import { categorizeDescription, OUTCOME_COLORS, getPitchLabel } from "@/lib/viz/colors";

export const metadata: Metadata = {
  title: "Daily picks · pitchtracker",
  description: "Pitch of the Day and Whiff of the Week, automatically curated.",
};

interface DailyFeatureRow {
  feature_kind: string;
  feature_date: string;
  game_pk: number;
  at_bat_number: number;
  pitch_number: number;
  pitcher_id: number | null;
  batter_id: number | null;
  reason: string | null;
}

interface NotableAtBatRow {
  game_pk: number;
  at_bat_number: number;
  pitcher_id: number | null;
  batter_id: number | null;
  pitch_count: number;
  whiff_count: number;
  is_strikeout: boolean;
  score: number;
  game_date: string;
}

export default async function DailyPage() {
  const supabase = await createClient();

  const [{ data: featuresRaw }, { data: notableRaw }] = await Promise.all([
    supabase
      .from("pitch_daily_features")
      .select("*")
      .order("feature_date", { ascending: false })
      .limit(20),
    supabase
      .from("pitch_notable_at_bats")
      .select(
        "game_pk, at_bat_number, pitcher_id, batter_id, pitch_count, whiff_count, is_strikeout, score, game_date",
      )
      .order("game_date", { ascending: false })
      .order("score", { ascending: false })
      .limit(15),
  ]);

  const features = (featuresRaw ?? []) as DailyFeatureRow[];
  const notable = (notableRaw ?? []) as NotableAtBatRow[];

  // Latest of each kind. Sorted desc above so the first match wins.
  const pitchOfDay =
    features.find((f) => f.feature_kind === "pitch_of_the_day") ?? null;
  const whiffOfWeek =
    features.find((f) => f.feature_kind === "whiff_of_the_week") ?? null;

  const playerIds = new Set<number>();
  for (const f of [pitchOfDay, whiffOfWeek]) {
    if (f?.pitcher_id) playerIds.add(f.pitcher_id);
    if (f?.batter_id) playerIds.add(f.batter_id);
  }
  for (const ab of notable) {
    if (ab.pitcher_id) playerIds.add(ab.pitcher_id);
    if (ab.batter_id) playerIds.add(ab.batter_id);
  }

  const gamePks = new Set<number>();
  if (pitchOfDay) gamePks.add(pitchOfDay.game_pk);
  if (whiffOfWeek) gamePks.add(whiffOfWeek.game_pk);
  for (const ab of notable) gamePks.add(ab.game_pk);

  // Pull pitcher/batter names + game/team metadata in parallel.
  const [{ data: pitcherRows }, batterMap, { data: gameRows }] =
    await Promise.all([
      playerIds.size > 0
        ? supabase
            .from("pitch_pitchers")
            .select("mlb_id, full_name")
            .in("mlb_id", Array.from(playerIds))
        : Promise.resolve({ data: [] }),
      fetchPersonsCached(Array.from(playerIds)),
      gamePks.size > 0
        ? supabase
            .from("pitch_games")
            .select("game_pk, game_date, home_team_id, away_team_id")
            .in("game_pk", Array.from(gamePks))
        : Promise.resolve({ data: [] }),
    ]);

  const pitcherById = new Map(
    (pitcherRows ?? []).map((p) => [p.mlb_id, p.full_name]),
  );
  const gameById = new Map(
    (gameRows ?? []).map((g) => [
      g.game_pk,
      g as { game_pk: number; game_date: string; home_team_id: number | null; away_team_id: number | null },
    ]),
  );

  const teamIds = new Set<number>();
  for (const g of gameRows ?? []) {
    if (g.home_team_id) teamIds.add(g.home_team_id);
    if (g.away_team_id) teamIds.add(g.away_team_id);
  }
  const { data: teamRows } =
    teamIds.size > 0
      ? await supabase
          .from("pitch_teams")
          .select("mlb_id, abbreviation")
          .in("mlb_id", Array.from(teamIds))
      : { data: [] };
  const teamAbbr = new Map((teamRows ?? []).map((t) => [t.mlb_id, t.abbreviation]));

  const resolveName = (id: number | null) => {
    if (!id) return "—";
    return (
      pitcherById.get(id) ?? batterMap.get(id)?.fullName ?? `Player #${id}`
    );
  };

  const matchupLine = (
    game: { home_team_id: number | null; away_team_id: number | null } | undefined,
  ) => {
    if (!game) return "";
    const home = game.home_team_id ? teamAbbr.get(game.home_team_id) : null;
    const away = game.away_team_id ? teamAbbr.get(game.away_team_id) : null;
    return `${away ?? "?"} @ ${home ?? "?"}`;
  };

  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 py-12">
      <div className="max-w-3xl mx-auto space-y-10">
        <div className="space-y-2">
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors"
          >
            ← pitchtracker
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Daily picks</h1>
          <p className="text-sm text-white/55 max-w-prose">
            Auto-curated from every available at-bat. Refreshed nightly.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-white/55">
            Pitch of the Day
          </h2>
          {pitchOfDay ? (
            <FeatureCard
              feature={pitchOfDay}
              pitcherName={resolveName(pitchOfDay.pitcher_id)}
              batterName={resolveName(pitchOfDay.batter_id)}
              matchup={matchupLine(gameById.get(pitchOfDay.game_pk))}
            />
          ) : (
            <p className="text-sm text-white/55">
              No pick computed yet. Run the cron at{" "}
              <code className="text-white/75 text-xs">/api/cron/refresh-notable-at-bats?secret=…</code>{" "}
              to populate.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-white/55">
            Whiff of the Week
          </h2>
          {whiffOfWeek ? (
            <FeatureCard
              feature={whiffOfWeek}
              pitcherName={resolveName(whiffOfWeek.pitcher_id)}
              batterName={resolveName(whiffOfWeek.batter_id)}
              matchup={matchupLine(gameById.get(whiffOfWeek.game_pk))}
            />
          ) : (
            <p className="text-sm text-white/55">No pick computed yet.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-white/55">
            Notable at-bats this week
          </h2>
          {notable.length === 0 ? (
            <p className="text-sm text-white/55">
              No scored at-bats yet — run the cron to populate.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {notable.map((ab) => (
                <li key={`${ab.game_pk}-${ab.at_bat_number}`}>
                  <Link
                    href={`/at-bat/${ab.game_pk}/${ab.at_bat_number}`}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 transition-colors"
                  >
                    <span className="text-[11px] tabular-nums text-white/45 w-20 truncate">
                      {ab.game_date}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm text-white/95 truncate">
                        {resolveName(ab.pitcher_id)}{" "}
                        <span className="text-white/40">vs</span>{" "}
                        {resolveName(ab.batter_id)}
                      </div>
                      <div className="text-[11px] text-white/55 tabular-nums">
                        {ab.pitch_count} pitches · {ab.whiff_count} whiff
                        {ab.whiff_count === 1 ? "" : "s"}
                        {ab.is_strikeout ? " · K" : ""} · score{" "}
                        {ab.score.toFixed(1)}
                      </div>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                      Replay →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function FeatureCard({
  feature,
  pitcherName,
  batterName,
  matchup,
}: {
  feature: DailyFeatureRow;
  pitcherName: string;
  batterName: string;
  matchup: string;
}) {
  const replayHref = `/at-bat/${feature.game_pk}/${feature.at_bat_number}?pitch=${feature.pitch_number}`;
  const cat = categorizeDescription(null);
  // Outcome color comes from the pre-computed reason; we don't have the
  // raw description here, so the dot stays neutral.
  const dotColor = OUTCOME_COLORS[cat];
  return (
    <Link
      href={replayHref}
      className="block p-5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 transition-colors"
    >
      <div className="flex items-start gap-4">
        {feature.pitcher_id ? (
          <div className="relative w-16 h-16 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
            <Image
              src={pitcherHeadshotUrl(feature.pitcher_id, 160)}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
            />
          </div>
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">
            {matchup} · {feature.feature_date}
          </div>
          <div className="text-lg font-semibold tracking-tight mt-0.5 truncate">
            {pitcherName}
          </div>
          <div className="text-sm text-white/65">
            <span className="text-white/45">vs</span> {batterName}
          </div>
          {feature.reason ? (
            <div className="flex items-center gap-2 mt-3 text-sm text-white/85 tabular-nums">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: dotColor }}
                aria-hidden
              />
              {feature.reason}
            </div>
          ) : null}
        </div>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">
          Replay →
        </span>
      </div>
    </Link>
  );
}

// Suppress ESLint unused-import warning until we surface pitch type
// in the feature card; getPitchLabel is reserved for the polish pass.
void getPitchLabel;
