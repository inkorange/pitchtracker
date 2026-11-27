"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { Spinner } from "@/components/feedback/Spinner";
import { personHeadshotUrl } from "@/lib/viz/headshot";

// Multi-select person search (pitchers or batters) with the selected
// people as removable chips inside the input box — design/Explore.dc.html
// "Who" section. Replaces MultiPitcherPicker and the Explore page's old
// "Batter IDs" text field.
//
// Names for IDs that arrive pre-selected (a shared ?pid=669373 link)
// are resolved through the same search endpoint, which accepts IDs.

export type PersonKind = "pitcher" | "batter";

interface Hit {
  mlb_id: number;
  full_name: string;
  meta: string;
  /** Pitchers: throws (L/R). Batters: bats (L/R/S). */
  hand: string | null;
}

export interface PersonInfo {
  name: string;
  hand: string | null;
}

const DEBOUNCE_MS = 300;

async function searchPeople(kind: PersonKind, q: string, signal?: AbortSignal): Promise<Hit[]> {
  const res = await fetch(`/api/${kind === "pitcher" ? "pitchers" : "batters"}/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    pitchers?: { mlb_id: number; full_name: string; throws: string | null }[];
    batters?: { mlb_id: number; full_name: string; bats: string | null }[];
  };
  if (kind === "pitcher") {
    return (data.pitchers ?? []).map((p) => ({
      mlb_id: p.mlb_id,
      full_name: p.full_name,
      meta: p.throws ? `${p.throws}HP` : "",
      hand: p.throws,
    }));
  }
  return (data.batters ?? []).map((b) => ({
    mlb_id: b.mlb_id,
    full_name: b.full_name,
    meta: b.bats ? `Bats ${b.bats}` : "",
    hand: b.bats,
  }));
}

export function MultiPersonPicker({
  kind,
  label,
  placeholder,
  value,
  onChange,
  onPeople,
}: {
  kind: PersonKind;
  label: string;
  placeholder: string;
  value: number[];
  onChange: (next: number[]) => void;
  /** Reports id → name + handedness for every selected person. */
  onPeople?: (people: Map<number, PersonInfo>) => void;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState<Map<number, PersonInfo>>(new Map());
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchPeople(kind, term, ctrl.signal)
        .then((h) => {
          setHits(h);
          setSearched(term);
          setActive(0);
        })
        .catch((err: unknown) => {
          if (!(err instanceof DOMException && err.name === "AbortError")) {
            setHits([]);
            setSearched(term);
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, kind]);

  // Resolve names for pre-selected IDs (deep links, example queries).
  useEffect(() => {
    const missing = value.filter((v) => !people.has(v));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((m) => searchPeople(kind, String(m)).catch(() => [] as Hit[]))).then((lists) => {
      if (cancelled) return;
      setPeople((prev) => {
        const next = new Map(prev);
        lists.forEach((l, i) => {
          const hit = l.find((h) => h.mlb_id === missing[i]);
          next.set(missing[i], { name: hit?.full_name ?? `#${missing[i]}`, hand: hit?.hand ?? null });
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [value, people, kind]);

  useEffect(() => {
    onPeople?.(people);
  }, [people, onPeople]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const shown = term.length >= 2 ? hits.filter((h) => !value.includes(h.mlb_id)) : [];
  const searching = term.length >= 2 && searched !== term;
  const noMatch = term.length >= 2 && searched === term && shown.length === 0;

  const add = (h: Hit) => {
    setPeople((prev) => new Map(prev).set(h.mlb_id, { name: h.full_name, hand: h.hand }));
    onChange([...value, h.mlb_id]);
    setQ("");
    setHits([]);
    inputRef.current?.focus();
  };
  const remove = (pid: number) => onChange(value.filter((v) => v !== pid));

  return (
    <div ref={boxRef} className="relative flex flex-col gap-2">
      <label htmlFor={id} className="label-caps">
        {label}
      </label>
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-[48px] px-2 py-1.5 rounded-control border border-line-strong bg-bg focus-within:border-ink-2 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 h-8 pl-1 pr-0.5 rounded-full bg-surface-2 border border-line-strong text-[13px] text-ink">
            <span className="relative size-6 rounded-full bg-avatar overflow-hidden">
              <Image src={personHeadshotUrl(v, 48)} alt="" fill sizes="24px" className="object-cover" unoptimized />
            </span>
            <span className="pl-1">{people.get(v)?.name ?? `#${v}`}</span>
            <button
              type="button"
              aria-label={`Remove ${people.get(v)?.name ?? v}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(v);
              }}
              className="size-7 flex items-center justify-center rounded-full text-ink-2 hover:text-ink"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${id}-${shown[active].mlb_id}` : undefined}
          value={q}
          placeholder={value.length ? "Add another…" : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              setActive((a) => Math.min(a + 1, shown.length - 1));
              e.preventDefault();
            } else if (e.key === "ArrowUp") {
              setActive((a) => Math.max(a - 1, 0));
              e.preventDefault();
            } else if (e.key === "Enter" && shown[active]) {
              add(shown[active]);
              e.preventDefault();
            } else if (e.key === "Backspace" && q === "" && value.length) {
              remove(value[value.length - 1]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="flex-[1_1_100px] min-w-[80px] h-8 px-1.5 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        {searching ? <Spinner className="mr-1" /> : null}
        <span className="sr-only" role="status" aria-live="polite">
          {searching ? "Searching" : ""}
        </span>
      </div>
      {open && noMatch ? (
        <p className="absolute top-full mt-1 z-30 w-full m-0 px-3 py-2.5 rounded-control bg-surface border border-line-strong shadow-2xl text-sm text-muted">
          No {kind}s match “{term}”.
        </p>
      ) : null}
      {open && shown.length > 0 ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute top-full mt-1 z-30 w-full list-none m-0 p-1 rounded-control bg-surface border border-line-strong shadow-2xl max-h-72 overflow-y-auto"
        >
          {shown.map((h, i) => (
            <li
              key={h.mlb_id}
              id={`${id}-${h.mlb_id}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                add(h);
              }}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-control cursor-pointer ${i === active ? "bg-surface-2" : ""}`}
            >
              <span className="relative size-8 shrink-0 rounded-full bg-avatar overflow-hidden">
                <Image src={personHeadshotUrl(h.mlb_id, 64)} alt="" fill sizes="32px" className="object-cover" unoptimized />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate">{h.full_name}</span>
                {h.meta ? <span className="text-xs text-muted">{h.meta}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
