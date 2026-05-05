import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";
import { getPitchLabel, getPitchColor } from "@/lib/viz/colors";
import { PitcherArsenalScene } from "./PitcherArsenalScene";
import { PitcherSearch } from "@/components/search/PitcherSearch";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}

export default async function PitcherPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { season: seasonParam } = await searchParams;
  const pitcherId = Number(id);
  if (!Number.isFinite(pitcherId)) notFound();

  const supabase = await createClient();

  const { data: pitcher } = await supabase
    .from("pitch_pitchers")
    .select("*")
    .eq("mlb_id", pitcherId)
    .maybeSingle();
  if (!pitcher) notFound();

  // Years where we have aggregates for this pitcher; default to most recent.
  const { data: seasonRows } = await supabase
    .from("pitch_pitcher_aggregates")
    .select("season")
    .eq("pitcher_id", pitcherId)
    .order("season", { ascending: false });
  const availableSeasons = Array.from(new Set((seasonRows ?? []).map((r) => r.season)));
  const season = seasonParam ? Number(seasonParam) : (availableSeasons[0] ?? new Date().getFullYear());

  const { data: aggregates } = await supabase
    .from("pitch_pitcher_aggregates")
    .select("*")
    .eq("pitcher_id", pitcherId)
    .eq("season", season)
    .eq("batter_hand", "*")
    .order("usage_pct", { ascending: false, nullsFirst: false });

  const { data: cachedPitches } = await supabase
    .from("pitch_game_pitches")
    .select(
      "game_pk, at_bat_number, pitch_number, pitch_type, pitch_name, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z",
    )
    .eq("pitcher_id", pitcherId)
    .limit(200);

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
      <PitcherArsenalScene
        pitches={(cachedPitches ?? []).filter((p) => p.vx0 != null && p.vy0 != null && p.vz0 != null)}
      />

      <header className="absolute top-6 left-6 right-6 flex items-start justify-between gap-6 pointer-events-none">
        <div className="flex gap-4 items-center pointer-events-auto">
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors"
          >
            ← pitchtracker
          </Link>
        </div>
        <div className="w-80 pointer-events-auto">
          <PitcherSearch placeholder="Search another pitcher…" />
        </div>
      </header>

      <section className="absolute top-20 left-6 w-[340px] rounded-lg bg-white/[0.06] backdrop-blur-md border border-white/10 shadow-lg p-4 space-y-3 pointer-events-auto">
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
              No arsenal data cached for {season}. Run the aggregates cron to populate.
            </div>
          ) : (
            <ul className="space-y-1">
              {aggregates!.map((a) => (
                <li
                  key={a.pitch_type}
                  className="flex items-center gap-2 text-xs tabular-nums"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: getPitchColor(a.pitch_type) }}
                  />
                  <span className="text-white/85 flex-1 truncate">
                    {getPitchLabel(a.pitch_type)}
                  </span>
                  <span className="text-white/55">
                    {a.avg_velocity != null ? `${a.avg_velocity.toFixed(1)} mph` : "—"}
                  </span>
                  <span className="text-white/45 w-10 text-right">
                    {a.usage_pct != null ? `${a.usage_pct.toFixed(0)}%` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(cachedPitches ?? []).length === 0 && (
          <div className="text-[11px] text-white/40 leading-relaxed pt-2 border-t border-white/5">
            No pitch trajectory data cached yet. The 3D scene will populate
            as games are loaded.
          </div>
        )}
      </section>
    </main>
  );
}

function SeasonPicker({
  pitcherId,
  season,
  available,
}: {
  pitcherId: number;
  season: number;
  available: number[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">Season</span>
      <div className="flex gap-1">
        {available.map((s) => (
          <Link
            key={s}
            href={`/pitcher/${pitcherId}?season=${s}`}
            className={`px-2 py-0.5 text-[11px] tabular-nums rounded ${
              s === season
                ? "bg-white/12 text-white"
                : "text-white/55 hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>
    </div>
  );
}
