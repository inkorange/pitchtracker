"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CompareSide } from "@/lib/viz/colors";
import { pitcherHeadshotUrl } from "@/lib/viz/headshot";

interface PitcherResult {
  mlb_id: number;
  full_name: string;
  throws: string | null;
  debut_year: number | null;
}

interface SwitchPitcherButtonProps {
  side: CompareSide;
}

// "Switch selected pitcher" — collapsed, renders a small button at
// the top of the pitcher card body. Expanded, renders a typeahead
// against /api/pitchers/search; picking a result rewrites the
// compare URL's a/b slot for this side, preserving the other
// pitcher's selection and the rest of the query state.
export function SwitchPitcherButton({ side }: SwitchPitcherButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PitcherResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Typeahead — debounce + abort, mirroring the existing PitcherSearch
  // patterns in the app.
  useEffect(() => {
    if (!open) return;
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
  }, [query, open]);

  // Click-outside to close the picker.
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  function pick(p: PitcherResult) {
    const sp = new URLSearchParams(params.toString());
    // Replace this side's pitcher id. Drop the per-side season + game
    // filter so they don't dangle on a pitcher who didn't play in the
    // previous season — the compare page will fall back to the
    // current year and an unfiltered game list.
    const idKey = side === "a" ? "a" : "b";
    const seasonKey = side === "a" ? "aSeason" : "bSeason";
    const gameKey = side === "a" ? "aGame" : "bGame";
    const pitchKey = side === "a" ? "aPitch" : "bPitch";
    sp.set(idKey, String(p.mlb_id));
    sp.delete(seasonKey);
    sp.delete(gameKey);
    sp.delete(pitchKey);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setOpen(false);
    setQuery("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] uppercase tracking-[0.14em] text-white/75 hover:text-white transition-colors"
      >
        Switch selected pitcher
      </button>
    );
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/55">
          Pick a new pitcher
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setQuery("");
          }}
          className="text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white"
        >
          Cancel
        </button>
      </div>
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a pitcher…"
        className="w-full px-3 py-1.5 rounded bg-white/[0.04] border border-white/10 focus:border-white/30 focus:outline-none text-sm text-white/95 placeholder:text-white/35"
        aria-label="Search a pitcher to switch in"
      />
      {query.trim().length >= 2 ? (
        <ul
          role="listbox"
          className="rounded-md bg-[#11161e] border border-white/10 shadow-2xl overflow-hidden max-h-60 overflow-y-auto"
        >
          {loading && results.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-white/45">Searching…</li>
          ) : null}
          {!loading && results.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-white/45">No matches.</li>
          ) : null}
          {results.map((p) => (
            <li key={p.mlb_id}>
              <button
                type="button"
                onClick={() => pick(p)}
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
  );
}
