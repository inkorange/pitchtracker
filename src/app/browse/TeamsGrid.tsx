"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import Image from "next/image";
import { teamLogoOnDarkUrl } from "@/lib/viz/headshot";
import { normalizeName } from "@/lib/pitchers/directory-shapes";

export interface GridTeam {
  id: number;
  abbr: string;
  name: string;
  league: string;
  division: string;
  badge: string | null;
}

const LEAGUES = [
  { key: "AL", title: "American League" },
  { key: "NL", title: "National League" },
];
const DIVISIONS = ["East", "Central", "West"];

/** "AL East" | "American League East" → "East". */
function divisionName(d: string): string {
  return DIVISIONS.find((x) => d.includes(x)) ?? d;
}
function leagueKey(t: GridTeam): string {
  return t.league.startsWith("N") || t.division.startsWith("NL") ? "NL" : "AL";
}

export function TeamsGrid({
  teams,
  season,
  seasonControl,
}: {
  teams: GridTeam[];
  season: number;
  seasonControl: ReactNode;
}) {
  const [q, setQ] = useState("");
  const needle = normalizeName(q.trim());
  const match = (t: GridTeam) =>
    needle === "" || normalizeName(`${t.name} ${t.abbr}`).includes(needle);
  const shown = teams.filter(match);

  return (
    <>
      <label htmlFor="tm-search" className="sr-only">
        Jump to a team
      </label>
      <input
        id="tm-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          // Enter on a single match jumps straight to it.
          if (e.key === "Enter" && shown.length === 1) window.location.href = `/browse/${shown[0].id}?season=${season}`;
        }}
        placeholder="Jump to a team — name, city or abbreviation"
        className="flex-[1_1_360px] min-w-0 h-[52px] px-[18px] rounded-control border border-line-strong bg-surface text-ink text-base placeholder:text-muted focus:outline-none focus:border-ink-2"
      />
      {seasonControl}
      <div className="basis-full flex flex-col gap-10 md:gap-12 pt-4 md:pt-6">
        {LEAGUES.map((lg) => {
          const inLeague = shown.filter((t) => leagueKey(t) === lg.key);
          if (inLeague.length === 0) return null;
          return (
            <section key={lg.key} aria-labelledby={`lg-${lg.key}`} className="flex flex-col gap-4">
              <h2 id={`lg-${lg.key}`} className="m-0 font-display font-extrabold italic uppercase text-[30px] md:text-4xl text-ink">
                {lg.title}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4">
                {DIVISIONS.map((div) => {
                  const list = inLeague.filter((t) => divisionName(t.division) === div);
                  if (list.length === 0) return null;
                  return (
                    <div key={div} className="flex flex-col gap-2">
                      <h3 className="m-0 self-start bg-avatar slant-right font-display font-bold text-[15px] tracking-[1.5px] uppercase text-ink pl-2.5 pr-4 py-[3px]">
                        {div}
                      </h3>
                      <ul className="list-none m-0 p-0 flex flex-col gap-2">
                        {list.map((t) => (
                          <li key={t.id}>
                            <Link
                              href={`/browse/${t.id}?season=${season}`}
                              className="group relative isolate overflow-hidden flex items-center gap-3.5 min-h-[68px] pl-[104px] pr-3.5 py-2.5 bg-surface border border-line rounded-control text-ink hover:text-ink hover:border-line-strong transition-colors"
                            >
                              {/* Oversized club mark behind the left edge,
                                  cropped by the card and faded into it. */}
                              <span aria-hidden="true" className="absolute -left-3 top-1/2 -translate-y-1/2 size-[104px] -z-10 opacity-35 group-hover:opacity-60 motion-safe:transition-opacity">
                                <Image src={teamLogoOnDarkUrl(t.id)} alt="" fill sizes="104px" className="object-contain" unoptimized />
                              </span>
                              <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,transparent_0%,transparent_30%,var(--surface)_62%)]" />
                              <span className="grow min-w-0 flex flex-col gap-[3px]">
                                <span className="text-[15px] font-semibold">{t.name}</span>
                                {t.badge ? <span className="text-xs text-highlight truncate">★ {t.badge}</span> : null}
                              </span>
                              <span aria-hidden="true" className="text-muted">
                                ›
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {shown.length === 0 ? <p className="text-muted">No team matches “{q}”.</p> : null}
      </div>
    </>
  );
}
