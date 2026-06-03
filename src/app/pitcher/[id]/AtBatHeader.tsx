"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { parseAsInteger, useQueryStates } from "nuqs";
import { eventPillColor } from "@/lib/viz/colors";
import { personHeadshotUrl, teamLogoUrl } from "@/lib/viz/headshot";

interface AtBatSummary {
  game_pk: number;
  at_bat_number: number;
  game_date: string;
  inning: number | null;
  inning_topbot: string | null;
  away_abbr: string | null;
  home_abbr: string | null;
  batter_team_id: number | null;
  pitch_count: number;
  outcome: string | null;
}

// Persistent at-bat info card pinned below the pitcher card whenever
// playback is active. Lives outside the collapsing pitcher body so it
// stays visible on mobile after the pitcher card auto-collapses on
// AB pick — the user always knows who they're watching and how the
// at-bat ended.
//
// Reads URL state directly (?vsBatter + ?abGame + ?abNum) so it's
// independent of MatchupsPanel state. Fetches the same /matchups
// endpoint the panel does; the browser cache dedups.
export function AtBatHeader({ season }: { season: number }) {
  const params = useParams<{ id?: string }>();
  const pitcherId = params?.id ? Number(params.id) : null;
  // shallow:false so URL writes from this header (Prev/Next AB,
  // exit-at-bat actions) trigger a server re-render — the page
  // server reads ?vsBatter for the per-pitch card aggregates and
  // ?abGame for the filter-summary banner.
  const [{ vsBatter, abGame, abNum }, setUrl] = useQueryStates(
    {
      vsBatter: parseAsInteger,
      abGame: parseAsInteger,
      abNum: parseAsInteger,
    },
    { shallow: false },
  );

  const [batterName, setBatterName] = useState<string | null>(null);
  const [atBat, setAtBat] = useState<AtBatSummary | null>(null);

  useEffect(() => {
    if (
      pitcherId == null ||
      vsBatter == null ||
      abGame == null ||
      abNum == null
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBatterName(null);
      setAtBat(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(
      `/api/pitcher/${pitcherId}/matchups?batterId=${vsBatter}&season=${season}`,
      { signal: ctrl.signal },
    )
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as {
          batterName: string;
          atBats: AtBatSummary[];
        };
        setBatterName(body.batterName);
        const found = body.atBats.find(
          (a) => a.game_pk === abGame && a.at_bat_number === abNum,
        );
        setAtBat(found ?? null);
      })
      .catch(() => {
        /* ignore */
      });
    return () => ctrl.abort();
  }, [pitcherId, vsBatter, abGame, abNum, season]);

  if (
    pitcherId == null ||
    vsBatter == null ||
    abGame == null ||
    abNum == null ||
    !atBat
  ) {
    return null;
  }

  return (
    <div className="sm:hidden border-t border-white/[0.08] mt-3 pt-3">
      <div className="flex items-start gap-2.5">
        {/* Batter headshot with the team-logo badge for the team
            they were on during this at-bat. */}
        <div className="relative w-10 h-10 flex-shrink-0">
          <div className="relative w-10 h-10 rounded-full bg-white/5 overflow-hidden">
            <Image
              src={personHeadshotUrl(vsBatter, 80)}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
              unoptimized
            />
          </div>
          {atBat.batter_team_id != null ? (
            <div className="absolute -bottom-0.5 -right-1 w-5 h-5 rounded-full bg-white border border-white/30 shadow flex items-center justify-center overflow-hidden">
              <Image
                src={teamLogoUrl(atBat.batter_team_id)}
                alt=""
                width={16}
                height={16}
                className="object-contain"
                unoptimized
              />
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="text-sm text-white/95 font-medium truncate flex-1">
              {batterName ?? "—"}
            </div>
            <span
              className={
                "inline-flex items-center px-2 py-0.5 rounded-full border text-white text-[9.5px] font-semibold uppercase tracking-[0.08em] shadow-sm flex-shrink-0 " +
                eventPillColor(atBat.outcome)
              }
            >
              {humanizeOutcome(atBat.outcome)}
            </span>
          </div>
          <div className="text-[10.5px] tabular-nums truncate text-white/55 mt-0.5">
            {atBat.game_date}
            {atBat.inning != null ? (
              <>
                {" "}
                · {atBat.inning_topbot === "Bot" ? "Bot" : "Top"} {atBat.inning}
              </>
            ) : null}
            {atBat.away_abbr || atBat.home_abbr ? (
              <>
                {" "}
                · {atBat.away_abbr ?? "?"} @ {atBat.home_abbr ?? "?"}
              </>
            ) : null}
            {" "}· {atBat.pitch_count} pitch
            {atBat.pitch_count === 1 ? "" : "es"}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setUrl({ abGame: null, abNum: null })}
          aria-label="Exit at-bat playback"
          className="flex-shrink-0 w-10 h-10 -mr-1 flex items-center justify-center rounded text-2xl leading-none text-white/55 hover:text-white hover:bg-white/[0.06]"
          title="Exit at-bat playback"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function humanizeOutcome(raw: string | null): string {
  if (!raw) return "—";
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
