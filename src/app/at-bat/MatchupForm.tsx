"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { personHeadshotUrl } from "@/lib/viz/headshot";

// Matchup finder form — design/AtBatReplays.dc.html (Matchup tab).
// Pitcher search hits /api/pitchers/search; once a pitcher is picked,
// batter search is scoped to the batters he actually faced
// (/api/pitcher/[id]/batters). Submitting navigates to
// /at-bat?p=…&b=…&season=…, which the server page renders.

export interface Picked {
  id: number;
  name: string;
  meta?: string;
}

interface Option extends Picked {
  key: string;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2);
}

function PersonPicker({
  label,
  placeholder,
  value,
  onChange,
  search,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: Picked | null;
  onChange: (p: Picked | null) => void;
  search: (q: string, signal: AbortSignal) => Promise<Option[]>;
  disabled?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState(value?.name ?? "");
  const [opts, setOpts] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2 || term === value?.name) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      search(term, ctrl.signal)
        .then((o) => {
          setOpts(o);
          setActive(0);
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open, search, value?.name]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (o: Option) => {
    onChange({ id: o.id, name: o.name, meta: o.meta });
    setQ(o.name);
    setOpen(false);
  };
  const shown = q.trim().length >= 2 && q !== value?.name ? opts : [];

  return (
    <div ref={boxRef} className="relative flex flex-col gap-2 min-w-0">
      <label htmlFor={id} className="label-caps">
        {label}
      </label>
      <div className="flex items-center gap-2.5 h-[52px] px-3.5 rounded-control border border-line-strong bg-bg-raised focus-within:border-ink-2">
        <span className="relative size-8 shrink-0 rounded-full bg-avatar overflow-hidden flex items-center justify-center text-[11px] font-bold text-ink-2">
          {value ? (
            <Image src={personHeadshotUrl(value.id, 64)} alt="" fill sizes="32px" className="object-cover" unoptimized />
          ) : (
            <span aria-hidden="true">{initials(q) || "?"}</span>
          )}
        </span>
        <span className="grow min-w-0 flex flex-col">
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={shown.length > 0}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={shown[active] ? `${id}-${shown[active].key}` : undefined}
            disabled={disabled}
            value={q}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              if (value) onChange(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                setActive((a) => Math.min(a + 1, shown.length - 1));
                e.preventDefault();
              } else if (e.key === "ArrowUp") {
                setActive((a) => Math.max(a - 1, 0));
                e.preventDefault();
              } else if (e.key === "Enter" && shown[active]) {
                pick(shown[active]);
                e.preventDefault();
              } else if (e.key === "Escape") setOpen(false);
            }}
            className="w-full bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none disabled:opacity-50"
          />
          {value?.meta ? <span className="text-xs text-muted truncate">{value.meta}</span> : null}
        </span>
        {value ? (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => {
              onChange(null);
              setQ("");
            }}
            className="size-8 shrink-0 flex items-center justify-center text-muted hover:text-ink"
          >
            ×
          </button>
        ) : null}
      </div>
      {open && shown.length > 0 ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute top-full mt-1 z-30 w-full list-none m-0 p-1 rounded-control bg-surface border border-line-strong shadow-2xl max-h-80 overflow-y-auto"
        >
          {shown.map((o, i) => (
            <li
              key={o.key}
              id={`${id}-${o.key}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-control cursor-pointer ${i === active ? "bg-surface-2" : ""}`}
            >
              <span className="relative size-8 shrink-0 rounded-full bg-avatar overflow-hidden">
                <Image src={personHeadshotUrl(o.id, 64)} alt="" fill sizes="32px" className="object-cover" unoptimized />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate">{o.name}</span>
                {o.meta ? <span className="text-xs text-muted truncate">{o.meta}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function MatchupForm({
  initialPitcher,
  initialBatter,
  initialSeason,
  seasons,
}: {
  initialPitcher: Picked | null;
  initialBatter: Picked | null;
  initialSeason: string;
  seasons: number[];
}) {
  const router = useRouter();
  const [pitcher, setPitcher] = useState<Picked | null>(initialPitcher);
  const [batter, setBatter] = useState<Picked | null>(initialBatter);
  const [season, setSeason] = useState(initialSeason);

  const searchPitchers = async (q: string, signal: AbortSignal): Promise<Option[]> => {
    const res = await fetch(`/api/pitchers/search?q=${encodeURIComponent(q)}`, { signal });
    const data = (await res.json()) as {
      pitchers?: { mlb_id: number; full_name: string; throws: string | null; debut_year: number | null }[];
    };
    return (data.pitchers ?? []).slice(0, 8).map((p) => ({
      key: String(p.mlb_id),
      id: p.mlb_id,
      name: p.full_name,
      meta: [p.throws ? `${p.throws}HP` : null, p.debut_year ? `debut ${p.debut_year}` : null].filter(Boolean).join(" · "),
    }));
  };

  // Batters this pitcher faced, in the selected season (or the latest
  // one when "All seasons" is chosen).
  const searchBatters = async (q: string, signal: AbortSignal): Promise<Option[]> => {
    if (!pitcher) return [];
    const s = season === "all" ? seasons[0] : season;
    const res = await fetch(
      `/api/pitcher/${pitcher.id}/batters?season=${s}&q=${encodeURIComponent(q)}`,
      { signal },
    );
    const data = (await res.json()) as { batters?: { id: number; fullName: string; results: string[] }[] };
    return (data.batters ?? []).map((b) => ({
      key: String(b.id),
      id: b.id,
      name: b.fullName,
      meta: b.results.length ? `${b.results.length} PA · ${b.results.slice(0, 6).join(" ")}` : undefined,
    }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!pitcher) return;
        const sp = new URLSearchParams({ p: String(pitcher.id) });
        if (batter) sp.set("b", String(batter.id));
        if (season !== "all") sp.set("season", season);
        router.push(`/at-bat?${sp}`);
      }}
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)_180px_auto] gap-3 items-end p-4 md:p-5 bg-surface border border-line border-t-[3px] border-t-accent rounded-control"
    >
      <PersonPicker
        label="Pitcher"
        placeholder="Search a pitcher"
        value={pitcher}
        onChange={(p) => {
          setPitcher(p);
          setBatter(null);
        }}
        search={searchPitchers}
      />
      <span
        aria-hidden="true"
        className="hidden lg:flex h-[52px] items-center justify-center font-display font-extrabold italic text-[26px] text-accent"
      >
        VS
      </span>
      <PersonPicker
        label="Batter (optional)"
        placeholder={pitcher ? "Anyone he faced" : "Pick a pitcher first"}
        value={batter}
        onChange={setBatter}
        search={searchBatters}
        disabled={!pitcher}
      />
      <label className="flex flex-col gap-2">
        <span className="label-caps">Seasons</span>
        <select
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          className="select-chevron h-[52px] pl-3 rounded-control border border-line-strong bg-bg-raised text-ink text-[15px]"
        >
          <option value="all">All seasons</option>
          {seasons.map((s) => (
            <option key={s} value={String(s)}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={!pitcher}
        className="h-[52px] px-[22px] rounded-control bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent text-white font-display font-bold text-xl tracking-[1px] uppercase"
      >
        Find at-bats
      </button>
    </form>
  );
}
