"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import {
  availableAtBatResultChips,
  expandAtBatEvents,
} from "@/lib/at-bat-events";
import { AtBatResultFilter } from "@/components/filters/AtBatResultFilter";
import { eventPillColor } from "@/lib/viz/colors";
import { personHeadshotUrl } from "@/lib/viz/headshot";
import { MatchupsCollapse } from "./MatchupsCollapse";

// Client-side sidebar for the at-bat replay page. Owns the `?event=`
// URL state via nuqs and uses shallow updates when the current AB
// still matches the new filter (no server roundtrip, instant
// re-filter). When the current AB no longer matches, it does a real
// navigation to the first matching AB (or the game-wide list if this
// pitcher's at-bats don't contain any matches).

export interface PitcherAbDisplay {
  at_bat_number: number;
  batter_id: number | null;
  batter_name: string;
  inning: number | null;
  inning_topbot: string | null;
  pitch_count: number;
  final_events: string | null;
  final_description: string | null;
}

interface Props {
  gamePk: number;
  currentAbN: number;
  allPitcherAbs: PitcherAbDisplay[];
}

export function PitcherMatchupsSidebar({
  gamePk,
  currentAbN,
  allPitcherAbs,
}: Props) {
  const router = useRouter();
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
      Array.from(
        availableAtBatResultChips(allPitcherAbs.map((ab) => ab.final_events)),
      ),
    [allPitcherAbs],
  );

  const filtered = useMemo(
    () =>
      eventSet.size === 0
        ? allPitcherAbs
        : allPitcherAbs.filter(
            (ab) => ab.final_events != null && eventSet.has(ab.final_events),
          ),
    [allPitcherAbs, eventSet],
  );

  const toggle = (key: string) => {
    const nextValue = active.length === 1 && active[0] === key ? "" : key;

    // Clearing the filter never changes the current AB.
    if (nextValue === "") {
      void setEventParam(null);
      return;
    }

    const nextSet = expandAtBatEvents([nextValue]);
    const current = allPitcherAbs.find((ab) => ab.at_bat_number === currentAbN);
    const currentMatches =
      current?.final_events != null && nextSet.has(current.final_events);

    if (currentMatches) {
      // Sidebar re-filters in place; current AB stays.
      void setEventParam(nextValue);
      return;
    }

    // Current AB falls out of the filter — jump to the first matching
    // AB by this pitcher. If none, send the user to the game-wide list
    // so they at least see what *does* match.
    const newFiltered = allPitcherAbs.filter(
      (ab) => ab.final_events != null && nextSet.has(ab.final_events),
    );
    const url =
      newFiltered.length > 0
        ? `/at-bat/${gamePk}/${newFiltered[0].at_bat_number}?event=${encodeURIComponent(nextValue)}`
        : `/at-bat/${gamePk}?event=${encodeURIComponent(nextValue)}`;
    router.push(url);
  };

  if (allPitcherAbs.length <= 1) return null;

  return (
    <div className="flex-1 min-h-0 flex flex-col mt-2 sm:mt-4">
      <div className="mb-2">
        <AtBatResultFilter
          active={active}
          onToggle={toggle}
          availableKeys={availableChipKeys}
          label="Filter at-bats by result"
          compact
        />
      </div>
      <MatchupsCollapse count={filtered.length}>
        <ul className="space-y-1">
          {filtered.map((ab) => {
            const isCurrent = ab.at_bat_number === currentAbN;
            const finalStr =
              ab.final_events && ab.final_events.length > 0
                ? ab.final_events
                : ab.final_description ?? "";
            const siblingHref = eventParam
              ? `/at-bat/${gamePk}/${ab.at_bat_number}?event=${encodeURIComponent(eventParam)}`
              : `/at-bat/${gamePk}/${ab.at_bat_number}`;
            return (
              <li key={ab.at_bat_number}>
                <Link
                  href={siblingHref}
                  aria-current={isCurrent ? "true" : undefined}
                  className={
                    "flex items-center gap-2 px-2 py-1.5 rounded-md border-2 transition-colors " +
                    (isCurrent
                      ? "bg-emerald-500/10 border-emerald-400/70 text-white pointer-events-none"
                      : "bg-white/[0.04] hover:bg-white/[0.1] border-white/10 text-white/85")
                  }
                >
                  {ab.batter_id ? (
                    <div className="relative w-7 h-7 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
                      <Image
                        src={personHeadshotUrl(ab.batter_id, 64)}
                        alt=""
                        fill
                        sizes="28px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] truncate">{ab.batter_name}</div>
                    <div
                      className={
                        "text-[10px] tabular-nums truncate " +
                        (isCurrent ? "text-white/70" : "text-white/45")
                      }
                    >
                      {ab.inning != null ? (
                        <>
                          {ab.inning_topbot === "Bot" ? "Bot" : "Top"} {ab.inning}
                        </>
                      ) : null}
                      {" · "}
                      {ab.pitch_count}p
                    </div>
                  </div>
                  <span
                    className={
                      "inline-flex items-center px-2 py-0.5 rounded-full border text-white text-[9.5px] font-semibold uppercase tracking-[0.08em] shadow-sm flex-shrink-0 " +
                      eventPillColor(finalStr)
                    }
                  >
                    {finalStr
                      ? finalStr
                          .split("_")
                          .map(
                            (w) => w.charAt(0).toUpperCase() + w.slice(1),
                          )
                          .join(" ")
                      : "—"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </MatchupsCollapse>
    </div>
  );
}
