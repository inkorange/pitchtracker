"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import {
  availableAtBatResultChips,
  expandAtBatEvents,
} from "@/lib/at-bat-events";
import { AtBatResultFilter } from "@/components/filters/AtBatResultFilter";
import { categorizeDescription, OUTCOME_COLORS } from "@/lib/viz/colors";
import { pitcherHeadshotUrl } from "@/lib/viz/headshot";
import { atBatPath } from "@/lib/url/pitcher-slug";

// Client-side rendering of the at-bat list so chip clicks update the
// URL shallowly (no server re-fetch) and re-render the list in place.
// The parent server component fetches and pre-resolves all the display
// data once; subsequent filter interactions never round-trip to the DB.

export interface AtBatDisplay {
  at_bat_number: number;
  pitch_count: number;
  inning: number;
  inning_topbot: "Top" | "Bot";
  pitcher_id: number | null;
  batter_id: number | null;
  pitcher_name: string;
  batter_name: string;
  outs_when_up: number;
  final_balls: number;
  final_strikes: number;
  events: string | null;
  last_description: string | null;
}

interface Props {
  gamePk: number;
  allAtBats: AtBatDisplay[];
  totalPitches: number;
}

export function AtBatGameList({ gamePk, allAtBats, totalPitches }: Props) {
  const [eventParam, setEventParam] = useQueryState(
    "event",
    parseAsString.withDefault("").withOptions({
      shallow: true,
      scroll: false,
      clearOnDefault: true,
    }),
  );

  const active = useMemo(
    () => (eventParam ? eventParam.split(",").filter(Boolean) : []),
    [eventParam],
  );

  const eventSet = useMemo(() => expandAtBatEvents(active), [active]);

  const availableChipKeys = useMemo(
    () =>
      Array.from(availableAtBatResultChips(allAtBats.map((ab) => ab.events))),
    [allAtBats],
  );

  const filtered = useMemo(
    () =>
      eventSet.size === 0
        ? allAtBats
        : allAtBats.filter(
            (ab) => ab.events != null && eventSet.has(ab.events),
          ),
    [allAtBats, eventSet],
  );

  const groups = useMemo(() => {
    const out: Array<{
      key: string;
      inning: number;
      half: "Top" | "Bot";
      atBats: AtBatDisplay[];
    }> = [];
    for (const ab of filtered) {
      const key = `${ab.inning}-${ab.inning_topbot}`;
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, inning: ab.inning, half: ab.inning_topbot, atBats: [] };
        out.push(g);
      }
      g.atBats.push(ab);
    }
    return out;
  }, [filtered]);

  const toggle = (key: string) => {
    if (active.length === 1 && active[0] === key) {
      void setEventParam(null);
    } else {
      void setEventParam(key);
    }
  };

  return (
    <>
      <p className="text-[11px] text-white/45 tabular-nums">
        {eventSet.size > 0
          ? `${filtered.length} of ${allAtBats.length} at-bats`
          : `${filtered.length} at-bats · ${totalPitches} pitches`}
      </p>

      <AtBatResultFilter
        active={active}
        onToggle={toggle}
        availableKeys={availableChipKeys}
      />

      <div className="space-y-6">
        {filtered.length === 0 && eventSet.size > 0 ? (
          <p className="text-sm text-white/55">
            No at-bats in this game matched the selected result. Clear the filter to see all at-bats.
          </p>
        ) : null}
        {groups.map((g) => (
          <section key={g.key} className="space-y-2">
            <h2 className="text-[10px] uppercase tracking-[0.18em] text-white/45 sticky top-0 bg-[#0a0e14]/95 backdrop-blur-sm py-1">
              {g.half} {g.inning}
            </h2>
            <ul className="grid grid-cols-1 gap-1.5">
              {g.atBats.map((ab) => (
                <AtBatRow
                  key={ab.at_bat_number}
                  gamePk={gamePk}
                  ab={ab}
                  eventParam={eventParam || null}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function AtBatRow({
  gamePk,
  ab,
  eventParam,
}: {
  gamePk: number;
  ab: AtBatDisplay;
  eventParam: string | null;
}) {
  const cat = categorizeDescription(ab.last_description);
  const dotColor = OUTCOME_COLORS[cat];
  const outcome = formatEvent(ab.events) ?? "In progress";
  const basePath = atBatPath(
    gamePk,
    ab.at_bat_number,
    ab.pitcher_name,
    ab.batter_name,
  );
  const href = eventParam
    ? `${basePath}?event=${encodeURIComponent(eventParam)}`
    : basePath;
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 transition-colors"
      >
        {ab.pitcher_id ? (
          <div className="relative w-8 h-8 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
            <Image
              src={pitcherHeadshotUrl(ab.pitcher_id, 60)}
              alt=""
              fill
              sizes="32px"
              className="object-cover"
              unoptimized
            />
          </div>
        ) : null}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="text-sm text-white/95 flex items-center gap-1.5 min-w-0">
            <span className="truncate">{ab.pitcher_name}</span>
            <span className="text-white/40 flex-shrink-0">vs</span>
            <span className="truncate flex-1 text-right">{ab.batter_name}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] text-white/55 tabular-nums truncate">
              AB #{ab.at_bat_number} · {ab.pitch_count} pitch
              {ab.pitch_count === 1 ? "" : "es"} · final {ab.final_balls}-
              {ab.final_strikes} · {ab.outs_when_up}{" "}
              {ab.outs_when_up === 1 ? "out" : "outs"}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: dotColor }}
                  aria-hidden
                />
                <span className="text-white/85 truncate max-w-[10rem]">
                  {outcome}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                Replay →
              </span>
            </div>
          </div>
        </div>
        {ab.batter_id ? (
          <div className="relative w-8 h-8 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
            <Image
              src={pitcherHeadshotUrl(ab.batter_id, 60)}
              alt=""
              fill
              sizes="32px"
              className="object-cover"
              unoptimized
            />
          </div>
        ) : null}
      </Link>
    </li>
  );
}

function formatEvent(events: string | null): string | null {
  if (!events || events.length === 0) return null;
  return events
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
