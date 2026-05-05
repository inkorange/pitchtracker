import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";
import { getPitchColorForSide, getPitchLabel, type CompareSide } from "@/lib/viz/colors";
import { PitcherSearch } from "@/components/search/PitcherSearch";
import { ComparisonScene } from "./ComparisonScene";

interface PageProps {
  searchParams: Promise<{
    a?: string;
    b?: string;
    aSeason?: string;
    bSeason?: string;
    pitch?: string;
    hand?: string;
  }>;
}

export default async function ComparePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const aId = Number(sp.a);
  const bId = Number(sp.b);
  const haveA = Number.isFinite(aId);
  const haveB = Number.isFinite(bId);

  if (!haveA || !haveB) {
    return <EmptyState aId={haveA ? aId : null} bId={haveB ? bId : null} />;
  }

  const supabase = await createClient();
  const currentYear = new Date().getFullYear();
  const aSeason = sp.aSeason ? Number(sp.aSeason) : currentYear;
  const bSeason = sp.bSeason ? Number(sp.bSeason) : currentYear;

  const [{ data: aPitcher }, { data: bPitcher }] = await Promise.all([
    supabase.from("pitch_pitchers").select("*").eq("mlb_id", aId).maybeSingle(),
    supabase.from("pitch_pitchers").select("*").eq("mlb_id", bId).maybeSingle(),
  ]);

  if (!aPitcher || !bPitcher) {
    return <EmptyState aId={haveA ? aId : null} bId={haveB ? bId : null} />;
  }

  const pitchTypes = (sp.pitch ?? "").split(",").filter(Boolean);
  const hand = sp.hand === "L" || sp.hand === "R" ? sp.hand : null;

  const [aPitches, bPitches, aAggregates, bAggregates] = await Promise.all([
    fetchPitches(supabase, aId, aSeason, pitchTypes, hand),
    fetchPitches(supabase, bId, bSeason, pitchTypes, hand),
    fetchAggregates(supabase, aId, aSeason),
    fetchAggregates(supabase, bId, bSeason),
  ]);

  const [aTeam, bTeam] = await Promise.all([
    aPitcher.current_team_id ? fetchTeam(supabase, aPitcher.current_team_id) : null,
    bPitcher.current_team_id ? fetchTeam(supabase, bPitcher.current_team_id) : null,
  ]);

  return (
    <main className="fixed inset-0 bg-[#0a0e14] overflow-hidden">
      <ComparisonScene aPitches={aPitches} bPitches={bPitches} />

      <header className="absolute top-6 left-6 right-6 flex items-start justify-between gap-6 pointer-events-none">
        <Link
          href="/"
          className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors pointer-events-auto"
        >
          ← pitchtracker
        </Link>
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/45 pointer-events-none">
          Compare
        </div>
      </header>

      <section className="absolute top-20 left-6 w-[380px] rounded-lg bg-white/[0.06] backdrop-blur-md border border-white/10 shadow-lg p-4 space-y-4 pointer-events-auto max-h-[calc(100vh-7rem)] overflow-y-auto">
        <PitcherCard
          side="a"
          pitcher={aPitcher}
          team={aTeam}
          season={aSeason}
          aggregates={aAggregates}
        />
        <div className="border-t border-white/[0.08]" />
        <PitcherCard
          side="b"
          pitcher={bPitcher}
          team={bTeam}
          season={bSeason}
          aggregates={bAggregates}
        />

        <div className="text-[11px] tabular-nums text-white/45 pt-2 border-t border-white/[0.05]">
          {aPitches.length + bPitches.length} pitches rendered ·{" "}
          {aPitches.length} from {aPitcher.last_name ?? "A"}, {bPitches.length} from{" "}
          {bPitcher.last_name ?? "B"}
        </div>
      </section>
    </main>
  );
}

interface PitcherRow {
  mlb_id: number;
  full_name: string;
  throws: string | null;
  current_team_id: number | null;
  debut_year: number | null;
}

interface TeamRow {
  mlb_id: number;
  name: string;
  abbreviation: string;
}

interface AggRow {
  pitch_type: string;
  pitch_count: number | null;
  usage_pct: number | null;
  avg_velocity: number | null;
}

async function fetchPitches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pitcherId: number,
  season: number,
  pitchTypes: string[],
  hand: "L" | "R" | null,
) {
  // Get game_pks from this season first.
  const { data: seasonGames } = await supabase
    .from("pitch_games")
    .select("game_pk")
    .eq("season", season);
  const seasonGamePks = (seasonGames ?? []).map((g) => g.game_pk);
  if (seasonGamePks.length === 0) return [];

  let q = supabase
    .from("pitch_game_pitches")
    .select(
      "pitch_type, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, stand",
    )
    .eq("pitcher_id", pitcherId)
    .in("game_pk", seasonGamePks)
    .limit(1500);
  if (pitchTypes.length > 0) q = q.in("pitch_type", pitchTypes);
  if (hand) q = q.eq("stand", hand);
  const { data } = await q;
  return data ?? [];
}

async function fetchAggregates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pitcherId: number,
  season: number,
): Promise<AggRow[]> {
  const { data } = await supabase
    .from("pitch_pitcher_aggregates")
    .select("pitch_type, pitch_count, usage_pct, avg_velocity")
    .eq("pitcher_id", pitcherId)
    .eq("season", season)
    .eq("batter_hand", "*")
    .order("usage_pct", { ascending: false, nullsFirst: false });
  return (data ?? []) as AggRow[];
}

async function fetchTeam(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: number,
): Promise<TeamRow | null> {
  const { data } = await supabase
    .from("pitch_teams")
    .select("mlb_id, name, abbreviation")
    .eq("mlb_id", teamId)
    .maybeSingle();
  return (data as TeamRow | null) ?? null;
}

function PitcherCard({
  side,
  pitcher,
  team,
  season,
  aggregates,
}: {
  side: CompareSide;
  pitcher: PitcherRow;
  team: TeamRow | null;
  season: number;
  aggregates: AggRow[];
}) {
  const sideLabel = side === "a" ? "Pitcher A" : "Pitcher B";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
          <Image
            src={pitcherHeadshotUrl(pitcher.mlb_id, 120)}
            alt=""
            fill
            sizes="48px"
            className="object-cover"
            unoptimized
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
            {sideLabel} · {season}
          </div>
          <div className="text-sm font-medium text-white truncate">{pitcher.full_name}</div>
          <div className="text-[11px] text-white/55 tabular-nums">
            {pitcher.throws ? `${pitcher.throws}HP` : ""}
            {team ? ` · ${team.abbreviation}` : ""}
          </div>
        </div>
        {team ? (
          <div className="relative w-9 h-9 flex-shrink-0">
            <Image
              src={teamLogoUrl(team.mlb_id)}
              alt={team.name}
              fill
              sizes="36px"
              className="object-contain"
              unoptimized
            />
          </div>
        ) : null}
      </div>
      {aggregates.length === 0 ? (
        <div className="text-xs text-white/55">No arsenal data cached for {season}.</div>
      ) : (
        <ul className="space-y-1">
          {aggregates.slice(0, 6).map((a) => (
            <li
              key={a.pitch_type}
              className="flex items-center gap-2 text-xs tabular-nums"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: getPitchColorForSide(a.pitch_type, side) }}
              />
              <span className="text-white/85 flex-1 truncate">
                {getPitchLabel(a.pitch_type)}
              </span>
              <span className="text-white/55">
                {a.avg_velocity != null ? `${Number(a.avg_velocity).toFixed(1)} mph` : "—"}
              </span>
              <span className="text-white/45 w-9 text-right">
                {a.usage_pct != null ? `${Number(a.usage_pct).toFixed(0)}%` : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function EmptyState({ aId, bId }: { aId: number | null; bId: number | null }) {
  // Look up either selected pitcher's name so the empty-state UI can show
  // who's already in the slot.
  const supabase = await createClient();
  const ids = [aId, bId].filter((x): x is number => x != null);
  const { data: rows } = ids.length
    ? await supabase
        .from("pitch_pitchers")
        .select("mlb_id, full_name")
        .in("mlb_id", ids)
    : { data: [] };
  const byId = new Map((rows ?? []).map((r) => [r.mlb_id, r.full_name]));

  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="space-y-2">
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-white/80 transition-colors"
          >
            ← pitchtracker
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Compare two pitchers</h1>
          <p className="text-sm text-white/55">
            Pick two pitchers (or the same pitcher across seasons) to overlay their arsenals
            in shared 3D space.
          </p>
        </div>

        <CompareSlot
          slot="a"
          selectedId={aId}
          selectedName={aId ? byId.get(aId) : undefined}
          otherId={bId}
        />

        <CompareSlot
          slot="b"
          selectedId={bId}
          selectedName={bId ? byId.get(bId) : undefined}
          otherId={aId}
        />
      </div>
    </main>
  );
}

function CompareSlot({
  slot,
  selectedId,
  selectedName,
  otherId,
}: {
  slot: "a" | "b";
  selectedId: number | null;
  selectedName?: string;
  otherId: number | null;
}) {
  const slotLabel = slot === "a" ? "Pitcher A" : "Pitcher B";
  const buildHref = (id: number) => {
    const sp = new URLSearchParams();
    if (slot === "a") {
      sp.set("a", String(id));
      if (otherId) sp.set("b", String(otherId));
    } else {
      if (otherId) sp.set("a", String(otherId));
      sp.set("b", String(id));
    }
    return `/compare?${sp.toString()}`;
  };
  const changeHref = (() => {
    const sp = new URLSearchParams();
    if (slot === "a" && otherId) sp.set("b", String(otherId));
    if (slot === "b" && otherId) sp.set("a", String(otherId));
    const qs = sp.toString();
    return qs ? `/compare?${qs}` : "/compare";
  })();

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
        {slotLabel}
      </div>
      {selectedId ? (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md bg-white/[0.06] border border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-9 h-9 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
              <Image
                src={pitcherHeadshotUrl(selectedId, 80)}
                alt=""
                fill
                sizes="36px"
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="text-sm text-white/95 truncate">
              {selectedName ?? `Pitcher ${selectedId}`}
            </div>
          </div>
          <Link
            href={changeHref}
            className="text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white/80 transition-colors"
          >
            Change
          </Link>
        </div>
      ) : (
        <PitcherSearch placeholder="Search a pitcher…" resultHref={buildHref} />
      )}
    </div>
  );
}
