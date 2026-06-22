import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { slugifyPitcherName } from "@/lib/url/pitcher-slug";
import { absoluteUrl } from "@/lib/url/site";
import { ensurePitcherSeasonCache } from "@/lib/cache/backfill";
import { pitcherHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";
import {
  categorizeDescription,
  getPitchLabel,
  getPitchColor,
  type OutcomeCategory,
} from "@/lib/viz/colors";
import { PitcherSearchPopover } from "@/components/chrome/PitcherSearchPopover";
import { SeasonPicker } from "@/components/filters/SeasonPicker";
import { HelpButton } from "../stats/HelpButton";
import { OutcomeLegend } from "@/app/compare/OutcomeLegend";
import { TopNav } from "@/components/chrome/TopNav";
import { FiltersGate } from "../FiltersGate";
import { MatchupsPanel } from "../MatchupsPanel";
import { PitcherCardCollapse } from "../PitcherCardCollapse";
import { AtBatHeader } from "../AtBatHeader";
import { PitcherBody } from "../PitcherBody";
import { StatsModeToggle } from "../StatsModeToggle";
import { PitcherFilters } from "@/components/filters/PitcherFilters";
import { PitcherStatsArea } from "../PitcherStatsArea";
import { PitcherOutcomeLegendGate } from "../PitcherOutcomeLegendGate";
import { expandAtBatEvents } from "@/lib/at-bat-events";
import { buildFilterSummary } from "@/lib/filter-summary";
import { buildPitcherBio, buildPitcherKeywords } from "@/lib/pitcher/bio";
import { RECENT_RIBBON_CAP } from "@/lib/viz/scene-tuning";
import {
  fetchPitcherGameLine,
  fetchPersonsCached,
  type MlbPitcherGameLine,
} from "@/lib/statsapi/client";
import { PitcherGameStats } from "../PitcherGameStats";

interface PageProps {
  params: Promise<{ id: string; slug: string }>;
  searchParams: Promise<{
    season?: string;
    pitch?: string;
    hand?: string;
    game?: string;
    outcome?: string;
    // Comma-separated chip keys (strikeout, walk, hit, home_run, out,
    // hit_by_pitch) or raw MLB event values. Expanded into the full
    // event set in `expandAtBatEvents`. Applied at the at-bat level:
    // keeps every pitch in any AB whose terminating pitch's `events`
    // is in the expanded set.
    event?: string;
    // Velocity range in mph (release_speed). Either bound may be omitted
    // for a one-sided filter. Used for "show me pitches over 95" queries.
    veloMin?: string;
    veloMax?: string;
    // Batter-scope and at-bat-replay params driven by the matchups
    // panel. Read on the server to build the filter-summary banner;
    // also consumed client-side by AtBatHeader / MatchupsPanel /
    // PitcherStatsView for narrowing and playback.
    vsBatter?: string;
    abGame?: string;
    abNum?: string;
  }>;
}

// SEO-relevant URL params that change the page's CONTENT scope and
// therefore deserve their own title/description/canonical. We
// intentionally exclude transient UI state like `abGame`/`abNum`
// (at-bat replay state) — those don't shift what the page is "about"
// in a way Google should index.
const SEO_QUERY_KEYS = [
  "season",
  "pitch",
  "hand",
  "outcome",
  "event",
  "veloMin",
  "veloMax",
] as const;

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const sp = await searchParams;
  const pitcherId = Number(id);
  if (!Number.isFinite(pitcherId)) {
    return { title: "Pitcher" };
  }
  const supabase = await createClient();
  const { data: pitcher } = await supabase
    .from("pitch_pitchers")
    .select("full_name, throws, current_team_id, debut_year, last_active_year")
    .eq("mlb_id", pitcherId)
    .maybeSingle();
  if (!pitcher) {
    return { title: "Pitcher" };
  }

  // Season computed early so the arsenal lookup below can target the
  // right pitch_pitcher_aggregates rows. The filter parsing further
  // down also consumes this same value.
  const currentYear = new Date().getFullYear();
  const season =
    sp.season && !Number.isNaN(Number(sp.season))
      ? Number(sp.season)
      : currentYear;

  // Team name + per-season arsenal in parallel — the arsenal phrase
  // turns the unfiltered description into per-pitcher unique content
  // ("Four-Seam (98 mph), Slider, Curveball, Splitter"), which is
  // much stronger SEO than every pitcher having the same boilerplate.
  // We pick the season's `batter_hand='*'` aggregates (both-handed
  // pool), ordered by usage. Falls back to the pitcher's most recent
  // active year if the current season has no rows yet (early season /
  // retired pitcher).
  const aggregatesSeason =
    pitcher.last_active_year && pitcher.last_active_year < currentYear
      ? pitcher.last_active_year
      : season;
  const [teamRes, aggregatesRes] = await Promise.all([
    pitcher.current_team_id
      ? supabase
          .from("pitch_teams")
          .select("name")
          .eq("mlb_id", pitcher.current_team_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("pitch_pitcher_aggregates")
      .select("pitch_type, pitch_count, avg_velocity")
      .eq("pitcher_id", pitcherId)
      .eq("season", aggregatesSeason)
      .eq("batter_hand", "*")
      .order("pitch_count", { ascending: false })
      .limit(4),
  ]);
  const teamName: string | null = teamRes.data?.name ?? null;
  const topPitches = aggregatesRes.data ?? [];
  // Lead the first pitch with its average velocity (rounded to whole
  // mph for the snippet — descriptions don't need 0.1 precision and
  // round numbers read cleaner). Subsequent pitches are name-only so
  // the line doesn't get long.
  let arsenalPhrase: string | null = null;
  if (topPitches.length > 0) {
    const lead = topPitches[0];
    const leadLabel = getPitchLabel(lead.pitch_type);
    const leadVelo =
      lead.avg_velocity != null
        ? `${Math.round(Number(lead.avg_velocity))} mph`
        : null;
    const leadStr = leadVelo ? `${leadLabel} (${leadVelo})` : leadLabel;
    const restStr = topPitches
      .slice(1)
      .map((p) => getPitchLabel(p.pitch_type))
      .join(", ");
    arsenalPhrase = restStr ? `${leadStr}, ${restStr}` : leadStr;
  }

  const throwsLabel =
    pitcher.throws === "L"
      ? "left-handed"
      : pitcher.throws === "R"
        ? "right-handed"
        : null;
  // Compact role tag — "Right-handed Pittsburgh Pirates pitcher" reads
  // more naturally than the comma list "right-handed, Pittsburgh
  // Pirates" did. Falls back gracefully when handedness or team is
  // unknown.
  const handCap = throwsLabel
    ? throwsLabel.charAt(0).toUpperCase() + throwsLabel.slice(1)
    : null;
  const roleParts: string[] = [];
  if (handCap) roleParts.push(handCap);
  if (teamName) roleParts.push(teamName);
  roleParts.push("pitcher");
  const roleLine = roleParts.join(" ");
  const debutLine = pitcher.debut_year ? `, MLB debut ${pitcher.debut_year}` : "";
  // Legacy stats line kept for the FILTERED description so that path's
  // copy stays unchanged (filter URLs lead with the filter phrase, the
  // bio context belongs at the end).
  const descParts: string[] = [];
  if (throwsLabel) descParts.push(throwsLabel);
  if (teamName) descParts.push(teamName);
  if (pitcher.debut_year) descParts.push(`MLB debut ${pitcher.debut_year}`);
  const statsLine = descParts.length ? ` ${descParts.join(", ")}.` : "";

  // Parse the SEO-content filters out of searchParams so each filter
  // permalink can advertise its own scope ("strikeouts over 96 mph in
  // 2026" instead of generic "pitch tracking"). Keeps Google's title /
  // description / canonical aligned with the actual URL being indexed.
  const pitchTypes = (sp.pitch ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const outcomes = (sp.outcome ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is OutcomeCategory =>
      ["whiff", "called", "ball", "foul", "inplay", "other"].includes(s),
    );
  const events = (sp.event ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const veloMin =
    sp.veloMin && !Number.isNaN(Number(sp.veloMin)) ? Number(sp.veloMin) : null;
  const veloMax =
    sp.veloMax && !Number.isNaN(Number(sp.veloMax)) ? Number(sp.veloMax) : null;
  const hand = sp.hand === "L" || sp.hand === "R" ? sp.hand : null;
  const hasFilter =
    pitchTypes.length > 0 ||
    outcomes.length > 0 ||
    events.length > 0 ||
    veloMin != null ||
    veloMax != null ||
    hand != null;

  // Build the filter phrase via the shared helper used for the
  // on-page banner. We pass batterName/game/atBat as null to skip
  // additional DB lookups in this hot path — the unfiltered branches
  // still render the right copy ("in {season}"), just without the
  // batter or game-date specificity. Worth doing in a follow-up if
  // batter-scoped permalinks become popular.
  const summary = buildFilterSummary({
    season,
    pitchTypes,
    outcomes,
    events,
    hand,
    game: null,
    veloMin,
    veloMax,
    batterName: null,
    atBat: null,
  });
  // Drop the leading "All " so the title reads "{name} strikeouts over
  // 96 mph in 2026" instead of "{name} All strikeouts over 96 mph in
  // 2026".
  const seoPhrase = summary.replace(/^All /, "");

  // Title: filter-aware when scoped, otherwise the original
  // brand-keyword phrase that ranks for "<name> pitch tracking".
  // Renders through the root layout's `%s · pitchtracker` template.
  const titlePhrase = hasFilter
    ? `${pitcher.full_name} ${seoPhrase}`
    : `${pitcher.full_name} pitch tracking`;

  // Description.
  //   Filtered URLs keep the filter-aware copy (each permalink already
  //   has its own unique scope phrase up front, so we don't dilute
  //   with arsenal data).
  //
  //   Unfiltered URLs lead with the pitcher's actual top pitches +
  //   velocity, then the role (RHP/LHP + team) + debut year. This
  //   turns a per-pitcher boilerplate into per-pitcher unique content
  //   that Google can index for "{name} slider", "{name} 99 mph
  //   fastball", etc. — and gives the SERP snippet real flavor
  //   instead of the same template across 4,000 pages.
  let description: string;
  if (hasFilter) {
    description = `${pitcher.full_name} ${seoPhrase} — every pitch in 3D on pitchtracker. Arsenal, movement plot, velocity histograms, and at-bat replay.${statsLine}`;
  } else if (arsenalPhrase) {
    description = `${pitcher.full_name} pitch tracking — ${arsenalPhrase} arsenal. ${roleLine}${debutLine}. Pitch-by-pitch 3D arsenal, movement plot, velocity histograms, and at-bat replay on pitchtracker.`;
  } else {
    description = `${pitcher.full_name} pitch tracking — every pitch in 3D. Arsenal, movement plot, velocity histograms, and at-bat replay on pitchtracker.${statsLine}`;
  }

  // Headshot at 1200px for the OG / Twitter card. Google prefers
  // ≥1200px when picking a SERP thumbnail; the 360 we used before
  // sometimes fell below that bar and no image showed. On-page
  // <Image> components use their own smaller sizes — this only
  // changes the meta-tag image URL.
  const headshotUrl = pitcherHeadshotUrl(pitcherId, 1200);

  // Canonical: slugged path PLUS the SEO-content query params (sorted
  // for stability), so each filter permalink has a self-canonical URL
  // and Google can index it as its own page instead of consolidating
  // it under the bare slug URL.
  const canonicalQs = new URLSearchParams();
  for (const key of SEO_QUERY_KEYS) {
    const value = sp[key];
    if (typeof value === "string" && value.length > 0) {
      canonicalQs.set(key, value);
    }
  }
  canonicalQs.sort();
  const canonicalPath = `/pitcher/${pitcherId}/${slugifyPitcherName(pitcher.full_name)}`;
  const canonicalQsString = canonicalQs.toString();
  const canonical = canonicalQsString
    ? `${canonicalPath}?${canonicalQsString}`
    : canonicalPath;

  // Keywords meta. Google has explicitly ignored <meta name="keywords">
  // since 2009, but Bing / Yandex factor it lightly and a few smaller
  // engines still parse it. Costs nothing to ship and keeps the page's
  // searchable surface honest about what it's actually about.
  const keywords = buildPitcherKeywords({
    name: pitcher.full_name,
    teamName,
    topPitches: topPitches.map((p) => ({ pitchType: p.pitch_type })),
  });

  return {
    title: titlePhrase,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      url: canonical,
      title: `${titlePhrase} · pitchtracker`,
      description,
      images: [{ url: headshotUrl, alt: pitcher.full_name }],
    },
    twitter: {
      card: "summary",
      title: `${titlePhrase} · pitchtracker`,
      description,
      images: [headshotUrl],
    },
  };
}

export default async function PitcherPage({ params, searchParams }: PageProps) {
  const { id, slug } = await params;
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

  // Slug normalization: if the request's slug doesn't match the
  // canonical slug for this pitcher (typo, stale share link,
  // pitcher renamed), 308-redirect to the canonical URL. Preserves
  // search params so deep-links (?season=&event=…) survive.
  const canonicalSlug = slugifyPitcherName(pitcher.full_name);
  if (slug !== canonicalSlug) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string" && v.length > 0) qs.set(k, v);
    }
    const tail = qs.toString();
    permanentRedirect(
      `/pitcher/${pitcherId}/${canonicalSlug}${tail ? `?${tail}` : ""}`,
    );
  }

  const currentYear = new Date().getFullYear();
  const season = sp.season ? Number(sp.season) : currentYear;

  // Season picker offers a fixed window: from current year back to the
  // pitcher's debut (or 6 years if debut isn't known). We never query
  // cross-season aggregates or game lists just to populate this list —
  // the user picks one year at a time and we only ever load that year's
  // pitches.
  const FALLBACK_YEARS = 6;
  const earliestSelectableYear = pitcher.debut_year
    ? Math.max(pitcher.debut_year, currentYear - FALLBACK_YEARS - 6)
    : currentYear - FALLBACK_YEARS;
  const availableSeasons: number[] = [];
  for (let y = currentYear; y >= earliestSelectableYear; y--) {
    availableSeasons.push(y);
  }

  // First-visit lazy backfill: if no pitches are cached for this pitcher
  // × season yet, pull from Savant on demand. No-op once cached.
  await ensurePitcherSeasonCache(pitcherId, season);

  // Pitches scoped to the active season via a Postgrest inner-join
  // filter on pitch_games.season. Per-game metadata is embedded so the
  // game dropdown reads from one fetch.
  //
  // Paginated to bypass Supabase's hard 1000-row server-side cap
  // (`db-max-rows`). `.range(0, N)` cannot raise the cap — the team
  // already discovered this for the arsenal route (see
  // src/app/api/pitcher/[id]/arsenal/route.ts:256). A starter with
  // > 1000 pitches in the season would otherwise silently get a
  // truncated result set and every in-JS-filtered count (HR events,
  // arsenal aggregates, the "Rendering N pitches" badge) would be
  // wrong — e.g. pitcher 642547 in 2026 has 1,242 pitches and the
  // pre-fix combined fetch dropped 242 rows including two HRs.
  //
  // Ordered on the primary key so pages are stable across requests.
  type EmbeddedGame = {
    season: number;
    game_date: string;
    home_team_id: number | null;
    away_team_id: number | null;
  };
  const PITCH_SELECT =
    "game_pk, at_bat_number, pitch_number, pitch_type, stand, description, events, release_pos_x, release_pos_y, release_pos_z, vx0, vy0, vz0, ax, ay, az, plate_x, plate_z, release_speed, release_spin_rate, spin_axis, pfx_x, pfx_z, release_extension, pitch_games!inner(season, game_date, home_team_id, away_team_id, game_type)";
  const PITCH_PAGE_SIZE = 1000;
  // Soft safety cap. Today's heaviest starter season is ~3.5K pitches;
  // 20 pages = 20K rows. If we ever hit this, something else is wrong.
  const PITCH_MAX_PAGES = 20;

  function buildPitchPageQuery(page: number) {
    let q = supabase
      .from("pitch_game_pitches")
      .select(PITCH_SELECT)
      .eq("pitcher_id", pitcherId)
      .eq("pitch_games.season", season)
      .eq("pitch_games.game_type", "R")
      .order("game_pk", { ascending: true })
      .order("at_bat_number", { ascending: true })
      .order("pitch_number", { ascending: true })
      .range(page * PITCH_PAGE_SIZE, (page + 1) * PITCH_PAGE_SIZE - 1);
    if (sp.hand === "L" || sp.hand === "R") q = q.eq("stand", sp.hand);
    if (sp.game) q = q.eq("game_pk", Number(sp.game));
    // ?vsBatter: narrow the per-side arsenal aggregates (the per-pitch
    // list with use% / velo in the pitcher card) to pitches thrown to
    // the selected batter. Keeps the card in sync with the
    // filter-summary banner ("All pitches vs <batter>") and with the
    // 3D scene + stats view, which also respect this param.
    if (sp.vsBatter && !Number.isNaN(Number(sp.vsBatter))) {
      q = q.eq("batter_id", Number(sp.vsBatter));
    }
    return q;
  }

  type PitchPageRow = NonNullable<
    Awaited<ReturnType<typeof buildPitchPageQuery>>["data"]
  >[number];

  const cachedPitchesAcc: PitchPageRow[] = [];
  for (let page = 0; page < PITCH_MAX_PAGES; page++) {
    const { data, error } = await buildPitchPageQuery(page);
    if (error || !data) break;
    cachedPitchesAcc.push(...(data as PitchPageRow[]));
    if (data.length < PITCH_PAGE_SIZE) break;
  }
  const cachedPitches = cachedPitchesAcc as
    | (PitchPageRow & { pitch_games?: EmbeddedGame })[]
    | null;

  // Arsenal totals come from the filter-but-no-pitch-type set so the chips
  // remain functional when one is selected. Outcomes filter applies in JS
  // — Statcast description strings have too many edge cases to express
  // cleanly in SQL.
  const outcomes = (sp.outcome ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is OutcomeCategory =>
      ["whiff", "called", "ball", "foul", "inplay", "other"].includes(s),
    );
  const outcomeSet = new Set(outcomes);
  // At-bat-result filter. Narrows to the TERMINATING pitch of each AB
  // (the one whose Statcast `events` column is set) — i.e., the actual
  // pitch that resulted in the strikeout / walk / hit / etc. Chip keys
  // like "strikeout" expand to ["strikeout", "strikeout_double_play"]
  // so viewers get natural-language behavior.
  const atBatEventInputs = (sp.event ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const atBatEventSet = expandAtBatEvents(atBatEventInputs);
  // Velocity bounds in mph. Either side may be unset for an open-ended
  // range. Applied at the same level as outcome/event so the arsenal
  // aggregates and pitch-type chip counts respect it.
  const veloMin = sp.veloMin && !Number.isNaN(Number(sp.veloMin)) ? Number(sp.veloMin) : null;
  const veloMax = sp.veloMax && !Number.isNaN(Number(sp.veloMax)) ? Number(sp.veloMax) : null;
  const arsenalPitches = (cachedPitches ?? []).filter((p) => {
    if (outcomeSet.size > 0 && !outcomeSet.has(categorizeDescription(p.description))) {
      return false;
    }
    if (atBatEventSet.size > 0) {
      if (!p.events || !atBatEventSet.has(p.events)) return false;
    }
    if (veloMin != null) {
      if (p.release_speed == null || p.release_speed < veloMin) return false;
    }
    if (veloMax != null) {
      if (p.release_speed == null || p.release_speed > veloMax) return false;
    }
    return true;
  });
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

  // Game dropdown is fetched separately from the pitch query so that
  // applying ?game=N (which narrows cachedPitches to a single game)
  // doesn't collapse the dropdown to one option. Sourced from the
  // pitcher×game mapping table joined with pitch_games metadata.
  type GameMeta = {
    game_pk: number;
    game_date: string;
    home_team_id: number | null;
    away_team_id: number | null;
  };
  type PitcherGameJoinRow = {
    game_pk: number;
    pitch_games: {
      game_date: string;
      home_team_id: number | null;
      away_team_id: number | null;
      season: number;
      game_type: string | null;
    } | null;
  };
  const { data: pitcherGameRowsRaw } = await supabase
    .from("pitch_pitcher_games")
    .select(
      "game_pk, pitch_games!inner(game_date, home_team_id, away_team_id, season, game_type)",
    )
    .eq("pitcher_id", pitcherId)
    .eq("pitch_games.season", season)
    .eq("pitch_games.game_type", "R");
  const pitcherGameRows = (pitcherGameRowsRaw ?? []) as unknown as PitcherGameJoinRow[];
  const gameByPk = new Map<number, GameMeta>();
  for (const r of pitcherGameRows) {
    if (gameByPk.has(r.game_pk)) continue;
    const meta = r.pitch_games;
    if (!meta) continue;
    gameByPk.set(r.game_pk, {
      game_pk: r.game_pk,
      game_date: meta.game_date,
      home_team_id: meta.home_team_id,
      away_team_id: meta.away_team_id,
    });
  }
  const gameMetaRows = Array.from(gameByPk.values());
  const teamIds = new Set<number>();
  for (const g of gameMetaRows) {
    if (g.home_team_id) teamIds.add(g.home_team_id);
    if (g.away_team_id) teamIds.add(g.away_team_id);
  }
  const { data: teamRows } =
    teamIds.size > 0
      ? await supabase
          .from("pitch_teams")
          .select("mlb_id, abbreviation, name")
          .in("mlb_id", Array.from(teamIds))
      : { data: [] };
  const teamAbbr = new Map<number, string>(
    (teamRows ?? []).map((t) => [t.mlb_id, t.abbreviation]),
  );
  // Full names for the filter-summary banner — "vs Boston Red Sox"
  // reads better than "vs BOS" when the user expands the URL.
  const teamFullName = new Map<number, string>(
    (teamRows ?? []).map((t) => [t.mlb_id, t.name]),
  );
  const games = gameMetaRows
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

  // Templated "About" bio for the pitcher card. Rendered inside a
  // HelpButton popover (hidden behind an (i) on the chrome), so the
  // text is in the SSR'd HTML for Google + assistive tech but doesn't
  // clutter the visual layout. Builds from the same data the SERP
  // description already uses, plus the per-season pitch volume from
  // `arsenalPitches` (only counted when meaningful, see bio builder).
  const bioParagraphs = buildPitcherBio({
    name: pitcher.full_name,
    throws:
      pitcher.throws === "L" || pitcher.throws === "R" ? pitcher.throws : null,
    teamName: team?.name ?? null,
    debutYear: pitcher.debut_year ?? null,
    lastActiveYear: pitcher.last_active_year ?? null,
    season,
    aggregatesSeason: season,
    topPitches: aggregates.slice(0, 4).map((a) => ({
      pitchType: a.pitch_type,
      avgVelocity: a.avg_velocity,
    })),
    seasonPitchCount: totalArsenal,
  });

  // Capture pitcher's current team for the opponent-resolution
  // closure below — TS can't carry the post-notFound() narrowing of
  // `pitcher` into the function body, so a local const sidesteps it.
  const pitcherTeamId = pitcher.current_team_id ?? null;

  // Resolve a game_pk to { game_date, opponentName } using the same
  // home/away → opponent logic shared between the URL ?game= filter
  // and the at-bat-replay (?abGame) summary.
  function resolveGameInfo(
    gamePk: number,
  ): {
    game_date: string;
    opponentName: string | null;
    opponentId: number | null;
  } | null {
    const meta = gameByPk.get(gamePk);
    if (!meta) return null;
    const opponentId =
      pitcherTeamId != null && meta.home_team_id === pitcherTeamId
        ? meta.away_team_id
        : pitcherTeamId != null && meta.away_team_id === pitcherTeamId
          ? meta.home_team_id
          : (meta.home_team_id ?? meta.away_team_id);
    return {
      game_date: meta.game_date,
      opponentName: opponentId ? (teamFullName.get(opponentId) ?? null) : null,
      opponentId: opponentId ?? null,
    };
  }

  // Resolve the currently-filtered game (if any) to a date + opponent
  // name for the filter-summary banner.
  const activeGameInfo = sp.game ? resolveGameInfo(Number(sp.game)) : null;
  // When a single game is filtered, default the matchups dialog's
  // team picker to that game's opponent — the user is asking "find
  // at-bats in THIS game", not "find at-bats from any game".
  const defaultMatchupTeamId = activeGameInfo?.opponentId ?? null;

  // Batter scope (?vsBatter=<id>) — resolve to a display name so the
  // filter-summary banner can say "vs James Wood" instead of
  // exposing the mlb_id.
  const vsBatterParam = sp.vsBatter ? Number(sp.vsBatter) : null;
  const vsBatterId =
    vsBatterParam != null && Number.isFinite(vsBatterParam)
      ? vsBatterParam
      : null;
  let batterName: string | null = null;
  if (vsBatterId != null) {
    try {
      const batterMap = await fetchPersonsCached([vsBatterId]);
      batterName = batterMap.get(vsBatterId)?.fullName ?? null;
    } catch {
      // Network blip — render the summary without the batter name.
    }
  }

  // At-bat playback context (?abGame=…&abNum=…). The replay's game
  // can differ from the URL's ?game= filter (the matchups panel
  // jumps the user across games), so we resolve abGame separately.
  let atBatInfo: {
    atBatNumber: number;
    game: { game_date: string; opponentName: string | null };
  } | null = null;
  if (sp.abGame && sp.abNum) {
    const pk = Number(sp.abGame);
    const num = Number(sp.abNum);
    if (Number.isFinite(pk) && Number.isFinite(num)) {
      const info = resolveGameInfo(pk);
      if (info) atBatInfo = { atBatNumber: num, game: info };
    }
  }

  // Game line panel — only when ?game=N is active. The official line
  // comes from the MLB boxscore (matches what fans see on MLB.com);
  // XBH is derived from our cached pitch events for this pitcher in
  // this game, since boxscore pitching stats don't break out 2B/3B.
  //
  // The XBH count must be GAME-SCOPED, not URL-filter-scoped — `HR` on
  // the panel comes from the boxscore (unfiltered) so deriving XBH
  // from the already-?hand/?pitch-narrowed `cachedPitches` produced
  // the impossible HR=1 / XBH=0 case when the HR was hit by a batter
  // outside the chip filter. Issue a dedicated query that ignores
  // the URL chips and just asks: "in this game, how many 2B/3B/HR
  // events did this pitcher give up?"
  let gameLine: MlbPitcherGameLine | null = null;
  let xbhInGame = 0;
  if (sp.game && activeGameInfo) {
    const activeGamePk = Number(sp.game);
    const [lineRes, xbhRes] = await Promise.all([
      fetchPitcherGameLine(activeGamePk, pitcherId).catch(() => null),
      supabase
        .from("pitch_game_pitches")
        .select("events", { count: "exact", head: true })
        .eq("pitcher_id", pitcherId)
        .eq("game_pk", activeGamePk)
        .in("events", ["double", "triple", "home_run"]),
    ]);
    gameLine = lineRes;
    xbhInGame = xbhRes.count ?? 0;
  }

  const filterSummary = buildFilterSummary({
    season,
    pitchTypes,
    outcomes,
    events: atBatEventInputs,
    hand: sp.hand === "L" || sp.hand === "R" ? sp.hand : null,
    game: activeGameInfo,
    veloMin,
    veloMax,
    batterName,
    atBat: atBatInfo,
  });

  // Schema.org Person markup — helps Google generate richer SERP
  // entries (sidebar card with image, "Plays for: <team>", etc.).
  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: pitcher.full_name,
    jobTitle: "Baseball Pitcher",
    image: pitcherHeadshotUrl(pitcher.mlb_id, 480),
    affiliation: team ? { "@type": "SportsTeam", name: team.name } : undefined,
    sameAs: [`https://www.mlb.com/player/${pitcher.mlb_id}`],
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      {
        "@type": "ListItem",
        position: 2,
        name: "Pitchers",
        item: absoluteUrl("/browse"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: pitcher.full_name,
        item: absoluteUrl(`/pitcher/${pitcher.mlb_id}/${canonicalSlug}`),
      },
    ],
  };

  return (
    <>
      {/* Scene + <main> wrapper live in /pitcher/layout.tsx so the
          3D canvas stays mounted across pitcher swaps. This page
          owns only the panels + chrome that should rebuild on
          pitcher change. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <PitcherOutcomeLegendGate>
        <OutcomeLegend />
      </PitcherOutcomeLegendGate>

      <TopNav
        back={{ href: "/", label: "Home" }}
        title="Pitcher"
        summary={filterSummary}
        rightSlot={
          <div className="flex items-center gap-1">
            <Link
              href={`/compare?a=${pitcher.mlb_id}&aSeason=${season}`}
              className="px-2.5 py-1 rounded-md bg-white/[0.12] hover:bg-white/[0.2] border border-white/20 text-white text-[10px] uppercase tracking-[0.14em] transition-colors"
            >
              Compare
            </Link>
            <PitcherSearchPopover />
          </div>
        }
      />

      {/* Card column. Absolute wrapper that holds the pitcher card AND
          the mobile-only summary banner stacked below it. Flex-col so
          the summary sits right beneath the card regardless of whether
          the card is collapsed (short) or expanded (tall + scrolling).
          `data-pitcher-card-column` marks the wrapper so PitcherStatsArea
          can anchor below the WHOLE column (card + summary), not just
          the card section — otherwise the summary banner overlaps the
          stat cards on mobile in stats mode. */}
      <div
        data-pitcher-card-column
        className="absolute top-16 left-3 right-3 sm:left-6 sm:right-auto z-20 sm:w-[340px] pointer-events-auto flex flex-col gap-2 max-h-[calc(100vh-5rem)]"
      >
      <section
        data-pitcher-card
        className="rounded-lg bg-[#081a32]/80 backdrop-blur-md border border-white/10 shadow-lg p-4 overflow-y-auto min-h-0"
      >
        <PitcherCardCollapse
          header={
            <>
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
                <div className="min-w-0 flex-1">
                  {/* H1 is the pitcher's name; the SEO-friendly
                      keyword extension ("pitch tracking") sits in a
                      visually-hidden span so the card still reads as
                      a name + stats line, but Google sees the full
                      target phrase as the page's heading. */}
                  <h1 className="text-base font-medium text-white truncate">
                    {pitcher.full_name}
                    <span className="sr-only"> pitch tracking</span>
                  </h1>
                  <div className="text-[11px] text-white/55 tabular-nums flex items-center gap-1.5">
                    <span>
                      {pitcher.throws ? `${pitcher.throws}HP` : "—"}
                      {team ? ` · ${team.abbreviation}` : ""}
                      {pitcher.debut_year
                        ? ` · debut ${pitcher.debut_year}`
                        : ""}
                    </span>
                    {bioParagraphs.length > 0 ? (
                      <HelpButton title="About">
                        {bioParagraphs.map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                      </HelpButton>
                    ) : null}
                  </div>
                </div>
                {team ? (
                  <div className="hidden sm:block relative w-14 h-14 flex-shrink-0">
                    <Image
                      src={teamLogoUrl(team.mlb_id)}
                      alt={team.name}
                      fill
                      sizes="56px"
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

              {/* Arsenal / Stats mode toggle. Rendered OUTSIDE
                  FiltersGate — the view toggle is not a per-side
                  filter and must stay reachable in at-bat playback so
                  the user can flip over to the batter-scoped stats
                  view without losing the AB context. */}
              <StatsModeToggle />
            </>
          }
          body={
            <PitcherBody
              arsenal={
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-2">Arsenal</div>
                  {(aggregates ?? []).length === 0 ? (
                    <div className="text-xs text-white/55 leading-relaxed">
                      No arsenal data for {season}.
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {aggregates!.map((a) => (
                        <li key={a.pitch_type} className="space-y-0.5">
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
              }
              filters={
                /* Per-side filters live inside the FiltersGate so they
                   collapse out of the way when at-bat mode is active. */
                <FiltersGate>
                  <div className="border-t border-white/[0.08] pt-3">
                    <PitcherFilters
                      arsenal={(aggregates ?? []).map((a) => ({
                        pitch_type: a.pitch_type,
                        pitch_count: a.pitch_count,
                      }))}
                      games={games}
                      season={season}
                      gameStatsSlot={
                        gameLine ? (
                          <PitcherGameStats
                            line={gameLine}
                            xbh={xbhInGame}
                            gameDate={activeGameInfo?.game_date ?? null}
                            opponentName={activeGameInfo?.opponentName ?? null}
                          />
                        ) : null
                      }
                    />
                  </div>

                  {renderable.length > 0 && (
                    <div className="text-[11px] text-white/45 tabular-nums pt-2 border-t border-white/[0.05] space-y-0.5">
                      <div>
                        Rendering {renderable.length} pitch
                        {renderable.length === 1 ? "" : "es"}
                      </div>
                      {renderable.length > RECENT_RIBBON_CAP && (
                        <div className="text-white/40 text-[10px]">
                          {RECENT_RIBBON_CAP.toLocaleString()} recent ·{" "}
                          {(renderable.length - RECENT_RIBBON_CAP).toLocaleString()}{" "}
                          historical as paths
                        </div>
                      )}
                    </div>
                  )}
                  {(cachedPitches ?? []).length === 0 && (
                    <div className="text-[11px] text-white/40 leading-relaxed pt-2 border-t border-white/5">
                      No pitch trajectory data available for this filter.
                    </div>
                  )}
                </FiltersGate>
              }
              matchups={
                /* Pitcher-vs-batter matchups: typeahead → at-bat list → playback. */
                <div className="border-t border-white/[0.08] pt-3 space-y-2">
                  <MatchupsPanel
                    season={season}
                    defaultTeamId={defaultMatchupTeamId}
                  />
                </div>
              }
            />
          }
        />

        {/* At-bat info card: lives outside the collapsing body so it
            stays on screen on mobile after the auto-collapse. Shows
            the active matchup's batter, outcome, and game context.
            Renders nothing when not in at-bat mode. */}
        <AtBatHeader season={season} />
      </section>

      {/* Mobile-only filter-summary banner. Lives in the top nav on
          desktop. Anchored just below the card via the flex-col
          wrapper so it tracks the card's bottom edge whether the body
          is collapsed or expanded. */}
      {filterSummary ? (
        <div className="sm:hidden flex-shrink-0 text-[12px] leading-snug text-white/85 italic bg-[#081a32]/70 backdrop-blur-md border border-white/10 rounded-md px-3 py-1.5 shadow-lg">
          {filterSummary}
        </div>
      ) : null}
      </div>

      {/* Stats analytics view — sibling of the pitcher card, NOT
          inside it. Renders nothing in arsenal mode. The
          server-rendered filter-summary string flows in so the
          scope banner mirrors the TopNav title and reflects every
          active URL filter (game / pitch type / outcome / event /
          hand / velo / batter / at-bat). */}
      <PitcherStatsArea filterSummary={filterSummary} />
    </>
  );
}


