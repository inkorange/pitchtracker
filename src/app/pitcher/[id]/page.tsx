import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ensurePitcherSeasonCache } from "@/lib/cache/backfill";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";
import { getPitchLabel, getPitchColor } from "@/lib/viz/colors";
import { PitcherArsenalScene } from "./PitcherArsenalScene";
import { PitcherSearch } from "@/components/search/PitcherSearch";
import { PitcherFilters } from "@/components/filters/PitcherFilters";
import { SeasonPicker } from "@/components/filters/SeasonPicker";
import { OutcomeLegend } from "@/app/compare/OutcomeLegend";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    season?: string;
    pitch?: string;
    hand?: string;
    game?: string;
  }>;
}

export default async function PitcherPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const pitcherId = Number(id);
  if (!Number.isFinite(pitcherId)) notFound();

  const supabase = await createClient();

  const { data: pitcher } = await supabase
    .from("pitch_pitchers")
    .select("*")
    .eq("mlb_id", pitcherId)
    .maybeSingle();
  if (!pitcher) notFound();

  const currentYear = new Date().getFullYear();

  // Pitchers can pick any of the last few years even if we haven't cached
  // anything for them yet — selecting a fresh year triggers backfill
  // (ensurePitcherSeasonCache below). Aggregate/pitches lookups still
  // contribute so debut years older than the rolling window stay
  // selectable.
  const FALLBACK_YEARS = 6;
  const fallbackSeasons = Array.from(
    { length: FALLBACK_YEARS + 1 },
    (_, i) => currentYear - i,
  );
  const { data: aggSeasonRows } = await supabase
    .from("pitch_pitcher_aggregates")
    .select("season")
    .eq("pitcher_id", pitcherId);
  const { data: pitcherGameRows } = await supabase
    .from("pitch_game_pitches")
    .select("game_pk")
    .eq("pitcher_id", pitcherId);
  const pitcherGamePks = Array.from(
    new Set((pitcherGameRows ?? []).map((r) => r.game_pk)),
  );
  const { data: pitcherGameSeasons } =
    pitcherGamePks.length > 0
      ? await supabase.from("pitch_games").select("season").in("game_pk", pitcherGamePks)
      : { data: [] };
  const seasonsWithData = new Set<number>(fallbackSeasons);
  for (const r of aggSeasonRows ?? []) seasonsWithData.add(r.season);
  for (const r of pitcherGameSeasons ?? []) seasonsWithData.add(r.season);
  const availableSeasons = Array.from(seasonsWithData).sort((a, b) => b - a);

  const season = sp.season ? Number(sp.season) : currentYear;

  // First-visit lazy backfill: if no pitches are cached for this pitcher
  // × season yet, pull from Savant on demand. No-op once cached.
  await ensurePitcherSeasonCache(pitcherId, season);

  // Look up game metadata for just the game_pks this pitcher actually has
  // pitches for. Going via the pitcher's game_pks (always ≤30 games) avoids
  // the 1000-row default cap on a "select * from pitch_games where season"
  // — a full MLB schedule has ~2400 games and was getting silently
  // truncated, sometimes excluding the very games this pitcher appeared in.
  const { data: pitcherGamesMeta } =
    pitcherGamePks.length > 0
      ? await supabase
          .from("pitch_games")
          .select("game_pk, game_date, season, home_team_id, away_team_id")
          .in("game_pk", pitcherGamePks)
      : { data: [] };
  const seasonGameMetas = (pitcherGamesMeta ?? []).filter(
    (g) => g.season === season,
  );
  const seasonGamePks = new Set(seasonGameMetas.map((g) => g.game_pk));

  // Cached pitches for this pitcher × season. Pitch-type filter is
  // applied in JS so the arsenal table reflects season+game+hand filters
  // but not the pitch-type chips themselves (those would otherwise blank
  // the arsenal whenever a chip is active).
  let pitchQuery = supabase
    .from("pitch_game_pitches")
    .select(
      "game_pk, at_bat_number, pitch_number, pitch_type, pitch_name, stand, description, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension",
    )
    .eq("pitcher_id", pitcherId)
    .limit(1500);
  if (seasonGamePks.size > 0) {
    pitchQuery = pitchQuery.in("game_pk", Array.from(seasonGamePks));
  } else {
    // No games for this season → no pitches.
    pitchQuery = pitchQuery.eq("game_pk", -1);
  }
  if (sp.hand === "L" || sp.hand === "R") {
    pitchQuery = pitchQuery.eq("stand", sp.hand);
  }
  if (sp.game) {
    pitchQuery = pitchQuery.eq("game_pk", Number(sp.game));
  }

  const { data: cachedPitches } = await pitchQuery;

  // Arsenal totals come from the filter-but-no-pitch-type set so the chips
  // remain functional when one is selected.
  const arsenalPitches = cachedPitches ?? [];
  const pitchTypes = (sp.pitch ?? "").split(",").filter(Boolean);
  const pitchTypeSet = new Set(pitchTypes);
  const filteredPitches =
    pitchTypeSet.size === 0
      ? arsenalPitches
      : arsenalPitches.filter(
          (p) => p.pitch_type != null && pitchTypeSet.has(p.pitch_type),
        );
  const renderable = filteredPitches.filter(
    (p) => p.vx0 != null && p.vy0 != null && p.vz0 != null,
  );

  type AggBucket = { count: number; sumVel: number; nVel: number };
  const aggBuckets = new Map<string, AggBucket>();
  for (const p of arsenalPitches) {
    if (!p.pitch_type) continue;
    const b = aggBuckets.get(p.pitch_type) ?? { count: 0, sumVel: 0, nVel: 0 };
    b.count += 1;
    if (p.release_speed != null) {
      b.sumVel += p.release_speed;
      b.nVel += 1;
    }
    aggBuckets.set(p.pitch_type, b);
  }
  const totalArsenal = arsenalPitches.length;
  const aggregates = Array.from(aggBuckets.entries())
    .map(([pitch_type, b]) => ({
      pitch_type,
      pitch_count: b.count,
      usage_pct: totalArsenal > 0 ? (b.count / totalArsenal) * 100 : 0,
      avg_velocity: b.nVel > 0 ? b.sumVel / b.nVel : null,
    }))
    .sort((a, b) => b.pitch_count - a.pitch_count);

  const gameMetaRows = seasonGameMetas;
  const teamIds = new Set<number>();
  for (const g of gameMetaRows ?? []) {
    if (g.home_team_id) teamIds.add(g.home_team_id);
    if (g.away_team_id) teamIds.add(g.away_team_id);
  }
  const { data: teamRows } = await supabase
    .from("pitch_teams")
    .select("mlb_id, abbreviation")
    .in("mlb_id", Array.from(teamIds));
  const teamAbbr = new Map<number, string>(
    (teamRows ?? []).map((t) => [t.mlb_id, t.abbreviation]),
  );
  const games = (gameMetaRows ?? [])
    .map((g) => ({
      game_pk: g.game_pk,
      game_date: g.game_date,
      away: g.away_team_id ? (teamAbbr.get(g.away_team_id) ?? "?") : "?",
      home: g.home_team_id ? (teamAbbr.get(g.home_team_id) ?? "?") : "?",
    }))
    .sort((a, b) => b.game_date.localeCompare(a.game_date));

  const team = pitcher.current_team_id
    ? await supabase
        .from("pitch_teams")
        .select("mlb_id, name, abbreviation")
        .eq("mlb_id", pitcher.current_team_id)
        .maybeSingle()
        .then((r) => r.data)
    : null;

  return (
    <main className="fixed inset-0 bg-[#0a0e14] overflow-hidden">
      <PitcherArsenalScene pitches={renderable} pitcherLabel={pitcherLastName(pitcher)} />

      <OutcomeLegend />

      <header className="absolute top-6 left-6 right-6 flex items-start justify-between gap-6 pointer-events-none">
        <div className="flex gap-4 items-center pointer-events-auto">
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors"
          >
            ← pitchtracker
          </Link>
          <Link
            href={`/compare?a=${pitcher.mlb_id}&aSeason=${season}`}
            className="px-2.5 py-1 rounded text-[11px] uppercase tracking-[0.14em] bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white/85 transition-colors"
          >
            Compare with…
          </Link>
        </div>
        <div className="w-80 pointer-events-auto">
          <PitcherSearch placeholder="Search another pitcher…" />
        </div>
      </header>

      <section className="absolute top-20 left-6 w-[340px] rounded-lg bg-white/[0.06] backdrop-blur-md border border-white/10 shadow-lg p-4 space-y-4 pointer-events-auto max-h-[calc(100vh-7rem)] overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
            <Image
              src={pitcherHeadshotUrl(pitcher.mlb_id, 120)}
              alt=""
              fill
              sizes="56px"
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="min-w-0">
            <div className="text-base font-medium text-white truncate">{pitcher.full_name}</div>
            <div className="text-[11px] text-white/55 tabular-nums">
              {pitcher.throws ? `${pitcher.throws}HP` : "—"}
              {team ? ` · ${team.abbreviation}` : ""}
              {pitcher.debut_year ? ` · debut ${pitcher.debut_year}` : ""}
            </div>
          </div>
          {team ? (
            <div className="relative w-10 h-10 flex-shrink-0">
              <Image
                src={teamLogoUrl(team.mlb_id)}
                alt={team.name}
                fill
                sizes="40px"
                className="object-contain"
                unoptimized
              />
            </div>
          ) : null}
        </div>

        <SeasonPicker
          pitcherId={pitcher.mlb_id}
          season={season}
          available={availableSeasons.length ? availableSeasons : [season]}
        />

        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-2">Arsenal</div>
          {(aggregates ?? []).length === 0 ? (
            <div className="text-xs text-white/55 leading-relaxed">
              No arsenal data cached for {season}.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {aggregates!.map((a) => (
                <li
                  key={a.pitch_type}
                  className="space-y-0.5"
                >
                  <div className="flex items-center gap-2 text-xs tabular-nums">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: getPitchColor(a.pitch_type) }}
                    />
                    <span className="text-white/85 flex-1 truncate">
                      {getPitchLabel(a.pitch_type)}
                    </span>
                    <span className="text-white/55">
                      {a.avg_velocity != null ? `${Number(a.avg_velocity).toFixed(1)} mph` : "—"}
                    </span>
                    <span className="text-white/45 w-16 text-right">
                      {a.usage_pct != null
                        ? `${Number(a.usage_pct).toFixed(0)}% (${a.pitch_count ?? 0})`
                        : "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-white/[0.08] pt-3">
          <PitcherFilters
            arsenal={(aggregates ?? []).map((a) => ({
              pitch_type: a.pitch_type,
              pitch_count: a.pitch_count,
            }))}
            games={games}
          />
        </div>

        {renderable.length > 0 && (
          <div className="text-[11px] text-white/45 tabular-nums pt-2 border-t border-white/[0.05]">
            Rendering {renderable.length} pitch{renderable.length === 1 ? "" : "es"}
          </div>
        )}
        {(cachedPitches ?? []).length === 0 && (
          <div className="text-[11px] text-white/40 leading-relaxed pt-2 border-t border-white/5">
            No pitch trajectory data cached yet for this filter.
          </div>
        )}
      </section>
    </main>
  );
}

function pitcherLastName(p: { full_name: string; last_name?: string | null }): string {
  if (p.last_name && p.last_name.trim().length > 0) return p.last_name;
  const parts = p.full_name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? p.full_name;
}

