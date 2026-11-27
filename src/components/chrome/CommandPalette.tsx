"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { pitcherHeadshotUrl } from "@/lib/viz/headshot";
import { pitcherPagePath } from "@/lib/url/pitcher-slug";

// Global "Find a pitcher" palette (design/DESIGN.md §3 Global nav).
// Opens from the header CTA or ⌘K / Ctrl+K. Results jump to the pitcher
// page; Enter with no query goes to /pitchers.
//
// Built on <dialog>.showModal(): focus trapping, Esc to close and the
// inert backdrop come from the platform.

interface Result {
  mlb_id: number;
  full_name: string;
  throws: string | null;
  debut_year: number | null;
}

export const OPEN_PALETTE_EVENT = "pitchtracker:palette-open";

export function openPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

export function CommandPalette() {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  // Open on ⌘K / Ctrl+K anywhere, or the custom event.
  useEffect(() => {
    const open = () => {
      const d = ref.current;
      if (!d || d.open) return;
      d.showModal();
      inputRef.current?.select();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, open);
    };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/pitchers/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { pitchers?: Result[] };
        setResults((data.pitchers ?? []).slice(0, 8));
        setActive(0);
      } catch {
        // aborted or transient — keep the last results
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const shown = q.trim().length >= 2 ? results : [];

  const close = () => ref.current?.close();
  const go = (href: string) => {
    close();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      setActive((a) => Math.min(a + 1, Math.max(shown.length - 1, 0)));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActive((a) => Math.max(a - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = shown[active];
      if (pick) go(pitcherPagePath(pick.mlb_id, pick.full_name));
      else if (q.trim() === "") go("/pitchers");
      else go(`/pitchers?q=${encodeURIComponent(q.trim())}`);
    }
  };

  return (
    <dialog
      ref={ref}
      aria-label="Find a pitcher"
      // Click on the backdrop (the dialog element itself) closes.
      onClick={(e) => e.target === ref.current && close()}
      onClose={() => setQ("")}
      className="m-auto mt-[12vh] w-[min(640px,calc(100vw-32px))] p-0 rounded-panel bg-surface border border-line-strong text-ink shadow-2xl backdrop:bg-bg/80 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 px-4 border-b border-line">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={shown.length > 0}
          aria-controls={listId}
          aria-activedescendant={shown[active] ? `${listId}-${shown[active].mlb_id}` : undefined}
          aria-autocomplete="list"
          aria-label="Pitcher name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Find a pitcher…"
          className="grow h-14 bg-transparent text-base text-ink placeholder:text-muted focus:outline-none"
        />
        <kbd className="hidden md:inline text-xs text-muted border border-line-strong rounded px-1.5 py-0.5">Esc</kbd>
      </div>
      <ul id={listId} role="listbox" className="list-none m-0 p-1.5 max-h-[50vh] overflow-y-auto">
        {shown.map((p, i) => (
          <li
            key={p.mlb_id}
            id={`${listId}-${p.mlb_id}`}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => go(pitcherPagePath(p.mlb_id, p.full_name))}
            className={`flex items-center gap-3 px-3 py-2 rounded-control cursor-pointer ${i === active ? "bg-surface-2" : ""}`}
          >
            <span className="relative size-9 shrink-0 rounded-full bg-avatar overflow-hidden">
              <Image src={pitcherHeadshotUrl(p.mlb_id, 80)} alt="" fill sizes="36px" className="object-cover" unoptimized />
            </span>
            <span className="flex flex-col min-w-0">
              <span className="font-semibold truncate">{p.full_name}</span>
              <span className="text-xs text-muted">
                {p.throws ? `${p.throws}HP` : "—"}
                {p.debut_year ? ` · debut ${p.debut_year}` : ""}
              </span>
            </span>
          </li>
        ))}
        {q.trim().length >= 2 && shown.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted">{loading ? "Searching…" : `No pitchers match “${q.trim()}”.`}</li>
        ) : null}
        {q.trim().length < 2 ? (
          <li className="px-3 py-3 text-sm text-muted">
            Type a name, or press <kbd className="text-ink-2">Enter</kbd> to browse all pitchers.
          </li>
        ) : null}
      </ul>
    </dialog>
  );
}
