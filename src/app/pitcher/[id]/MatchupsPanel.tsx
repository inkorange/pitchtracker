"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useParams } from "next/navigation";
import { parseAsInteger, useQueryState, useQueryStates } from "nuqs";
import { eventPillColor } from "@/lib/viz/colors";
import { personHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";

interface BatterResult {
  id: number;
  fullName: string;
}

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

  const [vsBatter, setVsBatter] = useQueryState("vsBatter", parseAsInteger);
  const [atBat, setAtBat] = useQueryStates({
    abGame: parseAsInteger,
    abNum: parseAsInteger,
  });

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
  const showInline = inAtBatMode && vsBatter != null;

  return (
    <div className="space-y-2">
      {showInline ? (
        <>
          <div className="flex items-baseline justify-between gap-2 px-1">
            <div className="text-[10px] uppercase tracking-[0.14em] text-white/55 truncate">
              Matchups
              {batterName ? (
                <span className="text-white/85"> · {batterName}</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white"
            >
              Change
            </button>
          </div>
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exitAtBat}
              className="flex-1 px-2.5 py-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] text-[10px] uppercase tracking-[0.14em] text-white/75 hover:text-white transition-colors"
            >
              Exit at-bat mode
            </button>
            <button
              type="button"
              onClick={clearMatchup}
              className="px-2 py-1.5 rounded-md border border-white/10 text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white"
            >
              Clear
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] uppercase tracking-[0.14em] text-white/75 hover:text-white transition-colors"
        >
          {vsBatter != null && batterName
            ? `Browse matchups · ${batterName}`
            : "Find at-bats"}
        </button>
      )}

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
      <div className="w-full max-w-md rounded-lg bg-[#081a32]/95 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden">
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
          className="px-2 py-1 rounded text-[14px] text-white/55 hover:text-white hover:bg-white/[0.06]"
        >
          ×
        </button>
      </div>
    </div>
  );
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
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const visibleResults = useMemo(
    () => (query.trim().length >= 2 ? results : []),
    [query, results],
  );
  const showHint = query.trim().length < 2;
  const showEmpty = !loading && !showHint && visibleResults.length === 0;

  return (
    <div className="p-4 space-y-3">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a batter name…"
        aria-label="Search a batter"
        className="w-full px-3 py-2 rounded bg-white/[0.04] border border-white/10 focus:border-white/30 focus:outline-none text-sm text-white/95 placeholder:text-white/35"
      />
      {showHint ? (
        <div className="text-[11px] text-white/45">
          Type at least 2 letters to search batters this pitcher faced in {season}.
        </div>
      ) : null}
      {showEmpty ? (
        <div className="text-[11px] text-white/55">
          No batters match. Try a different name or check the season filter.
        </div>
      ) : null}
      {visibleResults.length > 0 ? (
        <ul className="max-h-72 overflow-y-auto scrollbar-thin -mx-1">
          {visibleResults.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onPick(b)}
                className="w-full text-left px-3 py-2 rounded hover:bg-white/[0.06] transition-colors text-sm text-white/95"
              >
                {b.fullName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
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
        <div className="flex items-center gap-1.5 truncate">
          <span
            className={
              "inline-flex items-center px-2 py-0.5 rounded-full border text-white text-[9.5px] font-semibold uppercase tracking-[0.08em] shadow-sm flex-shrink-0 " +
              eventPillColor(ab.outcome)
            }
          >
            {humanizeOutcome(ab.outcome)}
          </span>
          <span
            className={
              "text-[11px] tabular-nums " +
              (current ? "text-white/65" : "text-white/45")
            }
          >
            {ab.pitch_count}p
          </span>
        </div>
        <div
          className={
            "text-[10.5px] tabular-nums truncate mt-1 " +
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
    </button>
  );
}

function humanizeOutcome(raw: string | null): string {
  if (!raw) return "—";
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
