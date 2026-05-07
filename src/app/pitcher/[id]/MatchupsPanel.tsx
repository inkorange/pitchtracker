"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  parseAsInteger,
  parseAsString,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { categorizeDescription, OUTCOME_COLORS } from "@/lib/viz/colors";

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
  pitch_count: number;
  outcome: string | null;
}

interface MatchupsPanelProps {
  /** The currently selected season on the pitcher page. */
  season: number;
}

// "Find at-bats" search + matchups list. URL-backed:
//   ?vsBatter=<batterId>           → batter selected, list visible
//   ?vsBatter=…&abGame=…&abNum=…   → at-bat mode active (handled by
//                                     the Scene shell, not this UI)
// Lives inside the pitcher info card body so it composes with the
// existing MobileCollapse on small viewports — exactly per spec.
export function MatchupsPanel({ season }: MatchupsPanelProps) {
  const params = useParams<{ id?: string }>();
  const pitcherId = params?.id ? Number(params.id) : null;

  const [vsBatter, setVsBatter] = useQueryState("vsBatter", parseAsInteger);
  const [batBat, setBatBat] = useQueryStates({
    abGame: parseAsInteger,
    abNum: parseAsInteger,
  });

  const [matchups, setMatchups] = useState<AtBatSummary[]>([]);
  const [batterName, setBatterName] = useState<string | null>(null);
  const [matchupsLoading, setMatchupsLoading] = useState(false);
  const [matchupsError, setMatchupsError] = useState<string | null>(null);

  // Re-fetch matchups whenever a batter is selected (or season changes).
  // The synchronous setState in this effect is intentional (the
  // typeahead/data-fetch pattern matches PitcherSearch) — the React
  // Compiler's caution about cascading renders doesn't apply here.
  useEffect(() => {
    if (vsBatter == null || pitcherId == null) {
      // eslint-disable-next-line
      setMatchups([]);
      setBatterName(null);
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
    setBatBat({ abGame: null, abNum: null });
  }

  function pickAtBat(ab: AtBatSummary) {
    setBatBat({ abGame: ab.game_pk, abNum: ab.at_bat_number });
  }

  function exitAtBat() {
    setBatBat({ abGame: null, abNum: null });
  }

  // Collapsed state — the user hasn't picked a batter yet.
  if (vsBatter == null) {
    return (
      <BatterSearchTrigger pitcherId={pitcherId} season={season} onPick={(id) => setVsBatter(id)} />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/55">
            vs batter
          </div>
          <div className="text-sm font-medium text-white truncate">
            {batterName ?? "…"}
          </div>
        </div>
        <button
          type="button"
          onClick={clearMatchup}
          className="text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white px-2 py-1 rounded hover:bg-white/[0.06]"
        >
          Change
        </button>
      </div>

      {matchupsError ? (
        <div className="text-[11px] text-rose-300/80">{matchupsError}</div>
      ) : null}

      {matchupsLoading ? (
        <div className="text-[11px] text-white/55">Loading at-bats…</div>
      ) : null}

      {!matchupsLoading && matchups.length === 0 && !matchupsError ? (
        <div className="text-[11px] text-white/55 italic">
          No matchups found for this season.
        </div>
      ) : null}

      {matchups.length > 0 ? (
        <ul className="space-y-1 max-h-72 overflow-y-auto scrollbar-thin pr-0.5">
          {matchups.map((ab) => {
            const active =
              batBat.abGame === ab.game_pk && batBat.abNum === ab.at_bat_number;
            return (
              <li key={`${ab.game_pk}-${ab.at_bat_number}`}>
                <button
                  type="button"
                  onClick={() => pickAtBat(ab)}
                  aria-pressed={active}
                  className={`w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-md border transition-colors ${
                    active
                      ? "bg-white/[0.12] border-white/25 text-white"
                      : "bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-white/85"
                  }`}
                >
                  <OutcomeDot outcome={ab.outcome} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] tabular-nums truncate">
                      <span className="text-white/55">{ab.game_date}</span>
                      {ab.away_abbr || ab.home_abbr ? (
                        <span className="text-white/45">
                          {" "}
                          · {ab.away_abbr ?? "?"} @ {ab.home_abbr ?? "?"}
                        </span>
                      ) : null}
                      {ab.inning != null ? (
                        <span className="text-white/45">
                          {" "}
                          · {ab.inning_topbot === "Bot" ? "Bot" : "Top"} {ab.inning}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] truncate">
                      {humanizeOutcome(ab.outcome)}{" "}
                      <span className="text-white/45 tabular-nums">
                        · {ab.pitch_count} pitch
                        {ab.pitch_count === 1 ? "" : "es"}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {batBat.abGame != null && batBat.abNum != null ? (
        <button
          type="button"
          onClick={exitAtBat}
          className="w-full px-2.5 py-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] text-[10px] uppercase tracking-[0.14em] text-white/75 hover:text-white transition-colors"
        >
          Exit at-bat mode
        </button>
      ) : null}
    </div>
  );
}

function OutcomeDot({ outcome }: { outcome: string | null }) {
  const cat = categorizeDescription(outcome);
  return (
    <span
      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
      style={{ background: OUTCOME_COLORS[cat] }}
      aria-hidden
    />
  );
}

function humanizeOutcome(raw: string | null): string {
  if (!raw) return "—";
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Collapsed-state UI. Renders a "Find at-bats" CTA; when clicked,
// expands into a typeahead picker. The collapsed CTA matches the
// pill aesthetic the rest of the side panel uses so it doesn't feel
// like a separate widget.
function BatterSearchTrigger({
  pitcherId,
  season,
  onPick,
}: {
  pitcherId: number | null;
  season: number;
  onPick: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useQueryState("batterQ", parseAsString);
  const [results, setResults] = useState<BatterResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const liveQuery = query ?? "";

  // Typeahead — debounced, abort-on-change.
  useEffect(() => {
    if (!open || pitcherId == null) return;
    const trimmed = liveQuery.trim();
    if (trimmed.length < 2) {
      // eslint-disable-next-line
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
        // ignore
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [liveQuery, open, pitcherId, season]);

  // Close + reset on outside click.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, setQuery]);

  const visibleResults = useMemo(
    () => (liveQuery.trim().length >= 2 ? results : []),
    [liveQuery, results],
  );
  const showDropdown = open && liveQuery.trim().length >= 2;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] uppercase tracking-[0.14em] text-white/75 hover:text-white transition-colors"
      >
        Find at-bats
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative space-y-2">
      <input
        autoFocus
        type="text"
        role="combobox"
        value={liveQuery}
        onChange={(e) => setQuery(e.target.value || null)}
        placeholder="Search batter…"
        aria-label="Search a batter to find matchups"
        aria-expanded={showDropdown}
        aria-controls="matchup-batter-listbox"
        aria-autocomplete="list"
        className="w-full px-3 py-1.5 rounded bg-white/[0.04] border border-white/10 focus:border-white/30 focus:outline-none text-sm text-white/95 placeholder:text-white/35"
      />
      {showDropdown ? (
        <ul
          id="matchup-batter-listbox"
          role="listbox"
          className="absolute left-0 right-0 z-20 rounded-md bg-[#11161e] border border-white/10 shadow-2xl overflow-hidden max-h-60 overflow-y-auto scrollbar-thin"
        >
          {loading && visibleResults.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-white/45">Searching…</li>
          ) : null}
          {!loading && visibleResults.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-white/45">
              No batters this pitcher faced match that.
            </li>
          ) : null}
          {visibleResults.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(b.id);
                  setOpen(false);
                  setQuery(null);
                }}
                className="w-full text-left px-2 py-1.5 hover:bg-white/[0.06] transition-colors text-[12px] text-white/95"
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
