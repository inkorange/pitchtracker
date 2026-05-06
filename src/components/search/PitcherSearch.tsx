"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { pitcherHeadshotUrl } from "@/lib/viz/headshot";

interface PitcherResult {
  mlb_id: number;
  full_name: string;
  throws: string | null;
  current_team_id: number | null;
  last_active_year: number | null;
  debut_year: number | null;
}

interface PitcherSearchProps {
  initialQuery?: string;
  autoFocus?: boolean;
  placeholder?: string;
  // Custom destination for a result click. Default: /pitcher/[id].
  resultHref?: (pitcherId: number) => string;
}

export function PitcherSearch({
  initialQuery = "",
  autoFocus = false,
  placeholder = "Search a pitcher…",
  resultHref,
}: PitcherSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PitcherResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    // Imperative loading state is the right fit for async typeahead; React 19's
    // set-state-in-effect rule is overzealous for this pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pitchers/search?q=${encodeURIComponent(trimmed)}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as { pitchers: PitcherResult[] };
        setResults(data.pitchers ?? []);
        setOpen(true);
      } catch {
        // Ignore aborts and transient network errors.
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Don't surface stale results when the query is too short.
  const visibleResults = useMemo(
    () => (query.trim().length >= 2 ? results : []),
    [query, results],
  );
  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        role="combobox"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => visibleResults.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-md bg-[#081a32]/80 backdrop-blur-md border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:border-white/25 transition-colors"
        aria-label="Search pitchers"
        aria-expanded={showDropdown}
        aria-controls="pitcher-search-listbox"
        aria-autocomplete="list"
      />
      {showDropdown && (
        <ul
          id="pitcher-search-listbox"
          role="listbox"
          className="absolute z-10 mt-2 w-full rounded-md bg-[#11161e] border border-white/10 shadow-2xl overflow-hidden"
        >
          {loading && visibleResults.length === 0 && (
            <li className="px-4 py-3 text-sm text-white/45" role="option" aria-selected={false}>
              Searching…
            </li>
          )}
          {!loading && visibleResults.length === 0 && (
            <li className="px-4 py-3 text-sm text-white/45" role="option" aria-selected={false}>
              No pitchers match “{query}”.
            </li>
          )}
          {visibleResults.map((p) => (
            <li key={p.mlb_id} role="option" aria-selected={false}>
              <Link
                href={resultHref ? resultHref(p.mlb_id) : `/pitcher/${p.mlb_id}`}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
                onClick={() => setOpen(false)}
              >
                <div className="relative w-10 h-10 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
                  <Image
                    src={pitcherHeadshotUrl(p.mlb_id, 80)}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/95 truncate">{p.full_name}</div>
                  <div className="text-[11px] text-white/45 tabular-nums">
                    {p.throws ? `${p.throws}HP` : "—"}
                    {p.debut_year ? ` · debut ${p.debut_year}` : ""}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
