"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { pitcherHeadshotUrl } from "@/lib/viz/headshot";

interface PitcherResult {
  mlb_id: number;
  full_name: string;
  throws: string | null;
  debut_year: number | null;
}

interface MultiPitcherPickerProps {
  /** Selected pitcher MLB IDs. */
  value: number[];
  /** Called whenever the selection changes (add or remove). */
  onChange: (next: number[]) => void;
  /** Optional label rendered above the input. */
  label?: string;
  placeholder?: string;
}

// Multi-select pitcher search. Typing fires the same /api/pitchers/search
// endpoint the home page uses; clicking a result *adds* the pitcher to
// the value list (vs. PitcherSearch which navigates). Selected pitchers
// render as removable chips above the input. Names for already-selected
// IDs are looked up once via the same endpoint so a deep-linked URL
// (?pid=669373) still shows "Skubal" not just the bare ID.
export function MultiPitcherPicker({
  value,
  onChange,
  label = "Pitchers",
  placeholder = "Type a pitcher name…",
}: MultiPitcherPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PitcherResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedNames, setSelectedNames] = useState<Map<number, string>>(
    new Map(),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Typeahead — debounce and abort like PitcherSearch.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/pitchers/search?q=${encodeURIComponent(trimmed)}`,
          { signal: ctrl.signal },
        );
        const data = (await res.json()) as { pitchers: PitcherResult[] };
        setResults(data.pitchers ?? []);
        setOpen(true);
      } catch {
        // Ignore aborts / network errors.
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [query]);

  // Resolve names for IDs we don't yet have a label for. Happens on
  // first mount when the URL came pre-populated, or after an example
  // patch added IDs the user hasn't typed.
  useEffect(() => {
    const missing = value.filter((id) => !selectedNames.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        // The pitchers endpoint doesn't accept ID lookups, so we hit
        // the per-ID lookup. Cheap because Supabase indexes mlb_id.
        const lookups = await Promise.all(
          missing.map((id) =>
            fetch(`/api/pitchers/search?q=${id}`)
              .then((r) => r.json() as Promise<{ pitchers: PitcherResult[] }>)
              .catch(() => ({ pitchers: [] })),
          ),
        );
        if (cancelled) return;
        const next = new Map(selectedNames);
        lookups.forEach((res, i) => {
          const match = (res.pitchers ?? []).find(
            (p) => p.mlb_id === missing[i],
          );
          if (match) next.set(missing[i], match.full_name);
          else next.set(missing[i], `Pitcher #${missing[i]}`);
        });
        setSelectedNames(next);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const visibleResults = useMemo(
    () =>
      query.trim().length >= 2
        ? results.filter((p) => !selectedSet.has(p.mlb_id))
        : [],
    [query, results, selectedSet],
  );
  const showDropdown = open && query.trim().length >= 2;

  function add(p: PitcherResult) {
    if (selectedSet.has(p.mlb_id)) return;
    onChange([...value, p.mlb_id]);
    const next = new Map(selectedNames);
    next.set(p.mlb_id, p.full_name);
    setSelectedNames(next);
    setQuery("");
    setOpen(false);
  }

  function remove(id: number) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div ref={containerRef} className="space-y-1.5">
      <div className="text-[11px] text-white/65">{label}</div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.12] border border-white/20 text-[11px] text-white/95"
            >
              {selectedNames.get(id) ?? `#${id}`}
              <button
                type="button"
                onClick={() => remove(id)}
                aria-label={`Remove ${selectedNames.get(id) ?? id}`}
                className="text-white/55 hover:text-white"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <input
          type="text"
          role="combobox"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => visibleResults.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full px-2 py-1 rounded bg-white/[0.04] border border-white/10 focus:border-white/30 focus:outline-none text-[12px] text-white/95 placeholder:text-white/30"
          aria-label={label}
          aria-expanded={showDropdown}
          aria-controls="multi-pitcher-listbox"
          aria-autocomplete="list"
        />
        {showDropdown ? (
          <ul
            id="multi-pitcher-listbox"
            role="listbox"
            className="absolute z-20 mt-1 w-full rounded-md bg-[#11161e] border border-white/10 shadow-2xl overflow-hidden max-h-72 overflow-y-auto"
          >
            {loading && visibleResults.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-white/45">
                Searching…
              </li>
            ) : null}
            {!loading && visibleResults.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-white/45">
                No matches.
              </li>
            ) : null}
            {visibleResults.map((p) => (
              <li key={p.mlb_id}>
                <button
                  type="button"
                  onClick={() => add(p)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/[0.06] transition-colors text-left"
                >
                  <div className="relative w-7 h-7 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
                    <Image
                      src={pitcherHeadshotUrl(p.mlb_id, 60)}
                      alt=""
                      fill
                      sizes="28px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-white/95 truncate">
                      {p.full_name}
                    </div>
                    <div className="text-[10px] text-white/45 tabular-nums">
                      {p.throws ? `${p.throws}HP` : ""}
                      {p.debut_year ? ` · debut ${p.debut_year}` : ""}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
