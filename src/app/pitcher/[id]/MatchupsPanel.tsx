"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useParams } from "next/navigation";
import { parseAsInteger, useQueryState, useQueryStates } from "nuqs";
import { eventPillColor } from "@/lib/viz/colors";
import { personHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";
import { formatAtBatResultLabel } from "@/lib/at-bat-events";

interface BatterResult {
  id: number;
  fullName: string;
  teamId: number | null;
  // Short-label outcomes for each at-bat this batter had against the
  // pitcher in the current scope. Rendered as small pills next to the
  // name so users can scan the matchup story at a glance.
  results: string[];
}

// Tailwind class set per result label. Keeps the row visually quiet
// while still hinting at K (red) vs hit (green) vs walk (yellow) etc.
const RESULT_PILL_STYLE: Record<string, string> = {
  K: "bg-red-500/20 border-red-400/40 text-red-100",
  BB: "bg-amber-500/20 border-amber-400/40 text-amber-100",
  HBP: "bg-amber-500/20 border-amber-400/40 text-amber-100",
  "1B": "bg-emerald-500/20 border-emerald-400/40 text-emerald-100",
  "2B": "bg-emerald-500/25 border-emerald-400/50 text-emerald-100",
  "3B": "bg-emerald-500/30 border-emerald-400/55 text-emerald-100",
  HR: "bg-fuchsia-500/25 border-fuchsia-400/50 text-fuchsia-100",
  Out: "bg-white/[0.06] border-white/15 text-white/65",
  E: "bg-sky-500/20 border-sky-400/40 text-sky-100",
  CI: "bg-sky-500/20 border-sky-400/40 text-sky-100",
};

interface AtBatSummary {
  game_pk: number;
  at_bat_number: number;
  game_date: string;
  inning: number | null;
  inning_topbot: string | null;
  away_abbr: string | null;
  home_abbr: string | null;
  batter_team_id: number | null;
  pitch_count: number;
  outcome: string | null;
  /** Last pitch's description — drives strikeout type (L/S/F). */
  last_description: string | null;
}

interface MatchupsPanelProps {
  /** The currently selected season on the pitcher page. */
  season: number;
}

// Compact "Find at-bats" entry point on the pitcher card. Opens a
// modal dialog over the page (rather than expanding inline) so the
// typeahead dropdown isn't clipped by the pitcher panel's scroll
// container. URL state survives the dialog closing — `?vsBatter` +
// `?abGame` + `?abNum` are the source of truth.
export function MatchupsPanel({ season }: MatchupsPanelProps) {
  const params = useParams<{ id?: string }>();
  const pitcherId = params?.id ? Number(params.id) : null;

  // shallow:false so URL writes trigger a server re-render — the page
  // server now reads ?vsBatter to scope the per-pitch card aggregates,
  // and ?abGame to resolve the filter-summary banner. Without this,
  // nuqs does history.replaceState only and the server-rendered card
  // shows stale numbers after the user picks / clears a batter.
  const [vsBatter, setVsBatter] = useQueryState(
    "vsBatter",
    parseAsInteger.withOptions({ shallow: false }),
  );
  const [atBat, setAtBat] = useQueryStates(
    {
      abGame: parseAsInteger,
      abNum: parseAsInteger,
    },
    { shallow: false },
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [batterName, setBatterName] = useState<string | null>(null);
  const [matchups, setMatchups] = useState<AtBatSummary[]>([]);
  const [matchupsLoading, setMatchupsLoading] = useState(false);
  const [matchupsError, setMatchupsError] = useState<string | null>(null);

  // Source of truth for matchups data. Fetched whenever a batter is
  // selected via URL, regardless of whether the dialog is open — so
  // the inline list (visible during at-bat mode) and the dialog list
  // share one fetch.
  useEffect(() => {
    if (vsBatter == null || pitcherId == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBatterName(null);
      setMatchups([]);
      setMatchupsError(null);
      return;
    }
    const ctrl = new AbortController();
    setMatchupsLoading(true);
    setMatchupsError(null);
    fetch(
      `/api/pitcher/${pitcherId}/matchups?batterId=${vsBatter}&season=${season}`,
      { signal: ctrl.signal },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`Matchups fetch ${res.status}`);
        const body = (await res.json()) as {
          batterName: string;
          atBats: AtBatSummary[];
        };
        setBatterName(body.batterName);
        setMatchups(body.atBats);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setMatchupsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setMatchupsLoading(false));
    return () => ctrl.abort();
  }, [vsBatter, pitcherId, season]);

  function clearMatchup() {
    setVsBatter(null);
    setAtBat({ abGame: null, abNum: null });
    setBatterName(null);
  }

  function exitAtBat() {
    setAtBat({ abGame: null, abNum: null });
  }

  const inAtBatMode = atBat.abGame != null && atBat.abNum != null;
  const batterScoped = vsBatter != null;
  const showInline = inAtBatMode && batterScoped;

  return (
    <div className="space-y-2">
      {batterScoped ? (
        // vsBatter chip card — anchors the matchup context with a
        // headshot + name + an X that cleanly exits vsBatter mode
        // (also clears at-bat mode so the inline list / AtBatHeader
        // don't end up stranded without a batter). Replaces the
        // previous "Browse matchups · <name>" button so the user has
        // an obvious exit affordance at all times, not just during
        // at-bat playback.
        <VsBatterChip
          batterId={vsBatter}
          batterName={batterName}
          onChange={() => setDialogOpen(true)}
          onClear={clearMatchup}
        />
      ) : null}

      {showInline ? (
        <>
          <InlineMatchupsList
            matchups={matchups}
            loading={matchupsLoading}
            error={matchupsError}
            batterId={vsBatter}
            currentGame={atBat.abGame}
            currentAtBat={atBat.abNum}
            onPickAtBat={(ab) =>
              setAtBat({ abGame: ab.game_pk, abNum: ab.at_bat_number })
            }
          />
          <button
            type="button"
            onClick={exitAtBat}
            className="w-full px-2.5 py-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] text-[10px] uppercase tracking-[0.14em] text-white/75 hover:text-white transition-colors"
          >
            Exit at-bat mode
          </button>
        </>
      ) : !batterScoped ? (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] uppercase tracking-[0.14em] text-white/75 hover:text-white transition-colors"
        >
          Find at-bats
        </button>
      ) : null}

      {dialogOpen ? (
        <MatchupsDialog
          pitcherId={pitcherId}
          season={season}
          vsBatter={vsBatter}
          batterName={batterName}
          matchups={matchups}
          matchupsLoading={matchupsLoading}
          matchupsError={matchupsError}
          onClose={() => setDialogOpen(false)}
          onPickBatter={(b) => {
            setVsBatter(b.id);
            setBatterName(b.fullName);
          }}
          onPickAtBat={(ab) => {
            setAtBat({ abGame: ab.game_pk, abNum: ab.at_bat_number });
            setDialogOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

// ─── vsBatter chip ───────────────────────────────────────────────
// Visible whenever ?vsBatter is set on the pitcher page. Anchors the
// matchup context with the batter's headshot + name, an X to exit
// vsBatter mode cleanly (also drops at-bat playback so the inline
// list / AtBatHeader don't strand without a batter), and a small
// Change action to reopen the matchups picker.
function VsBatterChip({
  batterId,
  batterName,
  onChange,
  onClear,
}: {
  batterId: number;
  batterName: string | null;
  onChange: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/10 pl-1.5 pr-1 py-1">
      <div className="relative w-9 h-9 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
        <Image
          src={personHeadshotUrl(batterId, 72)}
          alt=""
          fill
          sizes="36px"
          className="object-cover"
          unoptimized
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] uppercase tracking-[0.14em] text-white/45 leading-none">
          vs Batter
        </div>
        <div className="text-[13px] text-white/95 truncate leading-tight mt-0.5">
          {batterName ?? "Selected batter"}
        </div>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="text-[9px] uppercase tracking-[0.14em] text-white/55 hover:text-white px-1.5 py-1 rounded hover:bg-white/[0.06] transition-colors flex-shrink-0"
        aria-label="Change batter"
      >
        Change
      </button>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-white/55 hover:text-white hover:bg-white/[0.08] transition-colors flex-shrink-0"
        aria-label="Exit vsBatter mode"
        title="Exit vsBatter mode"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

// ─── dialog ──────────────────────────────────────────────────────
// Overlays the page via React portal. Inside it has two sub-views:
//   1. Typeahead — search a batter this pitcher faced this season.
//   2. Matchups list — pick an at-bat to enter playback.
// All matchups/loading state lives in MatchupsPanel and is passed
// in here as props so the inline list (visible in at-bat mode) and
// the dialog list share a single fetch.
function MatchupsDialog({
  pitcherId,
  season,
  vsBatter,
  batterName,
  matchups,
  matchupsLoading,
  matchupsError,
  onClose,
  onPickBatter,
  onPickAtBat,
}: {
  pitcherId: number | null;
  season: number;
  vsBatter: number | null;
  batterName: string | null;
  matchups: AtBatSummary[];
  matchupsLoading: boolean;
  matchupsError: string | null;
  onClose: () => void;
  onPickBatter: (b: BatterResult) => void;
  onPickAtBat: (ab: AtBatSummary) => void;
}) {
  // "Change batter" inside the dialog flips this on without clearing
  // the URL state — we don't want to drop the user's current matchup
  // until they pick a replacement (or close).
  const [forceSearch, setForceSearch] = useState(false);
  const showSearch = vsBatter == null || forceSearch;

  // Esc closes; also lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Find at-bats"
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md max-h-[60vh] sm:max-h-[85vh] rounded-lg bg-[#081a32]/95 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden">
        <DialogHeader
          batterName={showSearch ? null : batterName}
          onChangeBatter={() => setForceSearch(true)}
          onClose={onClose}
        />

        {showSearch ? (
          <BatterSearchBody
            pitcherId={pitcherId}
            season={season}
            onPick={(b) => {
              onPickBatter(b);
              setForceSearch(false);
            }}
          />
        ) : (
          <MatchupsListBody
            matchups={matchups}
            loading={matchupsLoading}
            error={matchupsError}
            batterId={vsBatter}
            onPickAtBat={onPickAtBat}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

function DialogHeader({
  batterName,
  onChangeBatter,
  onClose,
}: {
  batterName: string | null;
  onChangeBatter: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-white/[0.08]">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/55">
          {batterName ? "Matchups vs" : "Find at-bats"}
        </div>
        <div className="text-sm font-medium text-white truncate">
          {batterName ?? "Search a batter to begin"}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {batterName ? (
          <button
            type="button"
            onClick={onChangeBatter}
            className="px-2 py-1 rounded text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.06]"
          >
            Change
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center rounded text-2xl sm:text-[14px] leading-none text-white/55 hover:text-white hover:bg-white/[0.06]"
        >
          ×
        </button>
      </div>
    </div>
  );
}

interface TeamResult {
  id: number;
  abbr: string;
  name: string;
  gameCount: number;
  lastDate: string;
}

function BatterSearchBody({
  pitcherId,
  season,
  onPick,
}: {
  pitcherId: number | null;
  season: number;
  onPick: (b: BatterResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BatterResult[]>([]);
  const [suggestions, setSuggestions] = useState<BatterResult[]>([]);
  const [teams, setTeams] = useState<TeamResult[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamResult | null>(null);
  const [teamBatters, setTeamBatters] = useState<BatterResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Pre-load the suggestions (top batters) and the teams sidebar.
  // Same endpoint, no `q` and no `teamId`.
  useEffect(() => {
    if (pitcherId == null) return;
    const ctrl = new AbortController();
    fetch(`/api/pitcher/${pitcherId}/batters?season=${season}`, {
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as {
          batters: BatterResult[];
          teams?: TeamResult[];
        };
        setSuggestions(body.batters ?? []);
        setTeams(body.teams ?? []);
      })
      .catch(() => {
        /* ignore */
      });
    return () => ctrl.abort();
  }, [pitcherId, season]);

  // Fetch the full batter roster for the selected team.
  useEffect(() => {
    if (pitcherId == null || selectedTeam == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTeamBatters([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(
      `/api/pitcher/${pitcherId}/batters?season=${season}&teamId=${selectedTeam.id}`,
      { signal: ctrl.signal },
    )
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { batters: BatterResult[] };
        setTeamBatters(body.batters ?? []);
      })
      .catch(() => {
        /* ignore */
      });
    return () => ctrl.abort();
  }, [pitcherId, season, selectedTeam]);

  useEffect(() => {
    if (pitcherId == null) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/pitcher/${pitcherId}/batters?season=${season}&q=${encodeURIComponent(
            trimmed,
          )}`,
          { signal: ctrl.signal },
        );
        const body = (await res.json()) as { batters: BatterResult[] };
        setResults(body.batters ?? []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [query, pitcherId, season]);

  const trimmed = query.trim();
  // Search overrides team filter; team filter overrides suggestions.
  const mode: "suggestions" | "hint" | "results" | "team" =
    trimmed.length >= 2
      ? "results"
      : trimmed.length === 1
        ? "hint"
        : selectedTeam
          ? "team"
          : "suggestions";
  const showEmpty = mode === "results" && !loading && results.length === 0;

  return (
    <div className="p-4 space-y-3">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // Typing transitions out of team-filter mode — but keep the
          // selection around so clearing the query restores the team
          // view rather than the original suggestions screen.
        }}
        placeholder="Type a batter name…"
        aria-label="Search a batter"
        className="w-full px-3 py-2 rounded bg-white/[0.04] border border-white/10 focus:border-white/30 focus:outline-none text-sm text-white/95 placeholder:text-white/35"
      />

      {mode === "suggestions" ? (
        <SuggestionsTwoColumn
          batters={suggestions}
          teams={teams}
          onPickBatter={onPick}
          onPickTeam={setSelectedTeam}
        />
      ) : null}

      {mode === "team" && selectedTeam ? (
        <TeamFilterBody
          team={selectedTeam}
          batters={teamBatters}
          onPick={onPick}
          onClear={() => setSelectedTeam(null)}
        />
      ) : null}

      {mode === "hint" ? (
        <div className="text-[11px] text-white/45">
          Type at least 2 letters to search batters this pitcher faced in {season}.
        </div>
      ) : null}

      {showEmpty ? (
        <div className="text-[11px] text-white/55">
          No batters match. Try a different name or check the season filter.
        </div>
      ) : null}

      {mode === "results" && results.length > 0 ? (
        <BatterPickList batters={results} onPick={onPick} />
      ) : null}
    </div>
  );
}

// Suggestions screen: two columns. Batter picks on the left, teams
// faced on the right. The team list is scoped to the season the
// pitcher card is currently viewing.
function SuggestionsTwoColumn({
  batters,
  teams,
  onPickBatter,
  onPickTeam,
}: {
  batters: BatterResult[];
  teams: TeamResult[];
  onPickBatter: (b: BatterResult) => void;
  onPickTeam: (t: TeamResult) => void;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex-1 min-w-0 space-y-2">
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
          Most faced
        </div>
        {batters.length > 0 ? (
          <BatterPickList batters={batters} onPick={onPickBatter} />
        ) : (
          <div className="text-[11px] text-white/45">No data yet.</div>
        )}
      </div>
      {teams.length > 0 ? (
        <div className="w-32 flex-shrink-0 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">
            Teams faced
          </div>
          <TeamPickList teams={teams} onPick={onPickTeam} />
        </div>
      ) : null}
    </div>
  );
}

function TeamPickList({
  teams,
  onPick,
}: {
  teams: TeamResult[];
  onPick: (t: TeamResult) => void;
}) {
  return (
    <ul className="max-h-[50vh] sm:max-h-72 overflow-y-auto scrollbar-thin -mx-1">
      {teams.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onPick(t)}
            className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded hover:bg-white/[0.06] transition-colors"
          >
            <div className="relative w-6 h-6 flex-shrink-0 rounded-full bg-white border border-white/30 flex items-center justify-center overflow-hidden">
              <Image
                src={teamLogoUrl(t.id)}
                alt=""
                width={18}
                height={18}
                className="object-contain"
                unoptimized
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-white/95 truncate font-medium">
                {t.abbr}
              </div>
              <div className="text-[10px] text-white/45 tabular-nums truncate">
                {t.lastDate}
                {t.gameCount > 1 ? ` · ${t.gameCount}g` : ""}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TeamFilterBody({
  team,
  batters,
  onPick,
  onClear,
}: {
  team: TeamResult;
  batters: BatterResult[];
  onPick: (b: BatterResult) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.06] border border-white/10">
        <div className="relative w-6 h-6 flex-shrink-0 rounded-full bg-white border border-white/30 flex items-center justify-center overflow-hidden">
          <Image
            src={teamLogoUrl(team.id)}
            alt=""
            width={18}
            height={18}
            className="object-contain"
            unoptimized
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-white/95 truncate">{team.name}</div>
          <div className="text-[10px] text-white/45 tabular-nums truncate">
            {team.lastDate}
            {team.gameCount > 1 ? ` · ${team.gameCount}g` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear team filter"
          className="px-2 py-1 rounded text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.06] flex-shrink-0"
        >
          Clear
        </button>
      </div>
      {batters.length > 0 ? (
        <BatterPickList batters={batters} onPick={onPick} />
      ) : (
        <div className="text-[11px] text-white/45">
          No batters faced from this team yet.
        </div>
      )}
    </div>
  );
}

function BatterPickList({
  batters,
  onPick,
}: {
  batters: BatterResult[];
  onPick: (b: BatterResult) => void;
}) {
  return (
    <ul className="max-h-[50vh] sm:max-h-72 overflow-y-auto scrollbar-thin -mx-1">
      {batters.map((b) => (
        <li key={b.id}>
          <button
            type="button"
            onClick={() => onPick(b)}
            className="w-full flex items-start gap-2.5 text-left px-2 py-1.5 rounded hover:bg-white/[0.06] transition-colors text-sm text-white/95"
          >
            <div className="relative w-8 h-8 flex-shrink-0">
              <div className="relative w-8 h-8 rounded-full bg-white/5 overflow-hidden">
                <Image
                  src={personHeadshotUrl(b.id, 64)}
                  alt=""
                  fill
                  sizes="32px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              {b.teamId != null ? (
                <div className="absolute -bottom-0.5 -right-1 w-4 h-4 rounded-full bg-white border border-white/30 shadow flex items-center justify-center overflow-hidden">
                  <Image
                    src={teamLogoUrl(b.teamId)}
                    alt=""
                    width={12}
                    height={12}
                    className="object-contain"
                    unoptimized
                  />
                </div>
              ) : null}
            </div>
            {/* Name on its own line so it gets the full row width, then
                result chips wrap below. Prior single-row layout had the
                chips on the right with `flex-shrink-0`, which squeezed
                long names ("Andrew Benintendi" / "J.T. Realmuto") down
                to a single initial when six results sat next to them. */}
            <span className="flex-1 min-w-0 flex flex-col gap-1 pt-0.5">
              <span className="truncate leading-tight">{b.fullName}</span>
              {b.results.length > 0 ? (
                <span className="flex flex-wrap items-center gap-1">
                  {b.results.map((r, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold tracking-[0.04em] ${RESULT_PILL_STYLE[r] ?? "bg-white/[0.06] border-white/15 text-white/65"}`}
                    >
                      {r}
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MatchupsListBody({
  matchups,
  loading,
  error,
  batterId,
  onPickAtBat,
}: {
  matchups: AtBatSummary[];
  loading: boolean;
  error: string | null;
  batterId: number | null;
  onPickAtBat: (ab: AtBatSummary) => void;
}) {
  return (
    <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto scrollbar-thin">
      <MatchupsListContent
        matchups={matchups}
        loading={loading}
        error={error}
        batterId={batterId}
        onPickAtBat={onPickAtBat}
      />
    </div>
  );
}

// Inline list rendered on the pitcher card while in at-bat mode, so
// the user can hop between the active batter's at-bats without
// reopening the dialog. Marks the current at-bat with a brighter
// treatment.
function InlineMatchupsList({
  matchups,
  loading,
  error,
  batterId,
  currentGame,
  currentAtBat,
  onPickAtBat,
}: {
  matchups: AtBatSummary[];
  loading: boolean;
  error: string | null;
  batterId: number | null;
  currentGame: number | null;
  currentAtBat: number | null;
  onPickAtBat: (ab: AtBatSummary) => void;
}) {
  return (
    <div className="max-h-72 overflow-y-auto scrollbar-thin -mx-1 px-1">
      <MatchupsListContent
        matchups={matchups}
        loading={loading}
        error={error}
        batterId={batterId}
        currentGame={currentGame}
        currentAtBat={currentAtBat}
        onPickAtBat={onPickAtBat}
      />
    </div>
  );
}

function MatchupsListContent({
  matchups,
  loading,
  error,
  batterId,
  currentGame,
  currentAtBat,
  onPickAtBat,
}: {
  matchups: AtBatSummary[];
  loading: boolean;
  error: string | null;
  batterId: number | null;
  currentGame?: number | null;
  currentAtBat?: number | null;
  onPickAtBat: (ab: AtBatSummary) => void;
}) {
  return (
    <>
      {error ? (
        <div className="text-[11px] text-rose-300/80 px-1">{error}</div>
      ) : null}
      {loading && matchups.length === 0 ? (
        <div className="text-[11px] text-white/55 px-1">Loading at-bats…</div>
      ) : null}
      {!loading && matchups.length === 0 && !error ? (
        <div className="text-[12px] text-white/55 italic px-1">
          No matchups found for this season.
        </div>
      ) : null}
      {matchups.length > 0 ? (
        <ul className="space-y-1.5">
          {matchups.map((ab) => {
            const isCurrent =
              ab.game_pk === currentGame && ab.at_bat_number === currentAtBat;
            return (
              <li key={`${ab.game_pk}-${ab.at_bat_number}`}>
                <MatchupRow
                  ab={ab}
                  batterId={batterId}
                  current={isCurrent}
                  onPick={onPickAtBat}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

function MatchupRow({
  ab,
  batterId,
  current,
  onPick,
}: {
  ab: AtBatSummary;
  batterId: number | null;
  current: boolean;
  onPick: (ab: AtBatSummary) => void;
}) {
  return (
    <button
      type="button"
      aria-current={current ? "true" : undefined}
      onClick={() => onPick(ab)}
      className={
        "w-full text-left flex items-center gap-2.5 px-2 py-2 rounded-md border transition-colors " +
        (current
          ? "bg-white/[0.14] border-white/30 text-white"
          : "bg-white/[0.04] hover:bg-white/[0.1] border-white/10 text-white/85")
      }
    >
      {/* Batter headshot with the team-logo badge at the time of the
          AB tucked into the bottom-right corner. */}
      <div className="relative w-10 h-10 flex-shrink-0">
        {batterId != null ? (
          <div className="relative w-10 h-10 rounded-full bg-white/5 overflow-hidden">
            <Image
              src={personHeadshotUrl(batterId, 80)}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
              unoptimized
            />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full bg-white/5" />
        )}
        {ab.batter_team_id != null ? (
          <div className="absolute -bottom-0.5 -right-1 w-5 h-5 rounded-full bg-white border border-white/30 shadow flex items-center justify-center overflow-hidden">
            <Image
              src={teamLogoUrl(ab.batter_team_id)}
              alt=""
              width={16}
              height={16}
              className="object-contain"
              unoptimized
            />
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[11px] tabular-nums truncate text-white/95">
          {ab.pitch_count} pitch{ab.pitch_count === 1 ? "" : "es"}
        </div>
        <div
          className={
            "text-[10.5px] tabular-nums truncate mt-0.5 " +
            (current ? "text-white/70" : "text-white/45")
          }
        >
          {ab.game_date}
          {ab.inning != null ? (
            <>
              {" "}
              · {ab.inning_topbot === "Bot" ? "Bot" : "Top"} {ab.inning}
            </>
          ) : null}
          {ab.away_abbr || ab.home_abbr ? (
            <>
              {" "}
              · {ab.away_abbr ?? "?"} @ {ab.home_abbr ?? "?"}
            </>
          ) : null}
        </div>
      </div>

      <span
        className={
          "inline-flex items-center px-2 py-0.5 rounded-full border text-white text-[9.5px] font-semibold uppercase tracking-[0.08em] shadow-sm flex-shrink-0 ml-2 " +
          eventPillColor(ab.outcome)
        }
      >
        {formatAtBatResultLabel(ab.outcome, ab.last_description)}
      </span>
    </button>
  );
}
