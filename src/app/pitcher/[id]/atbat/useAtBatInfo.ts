"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// The current at-bat's context (batter, game, inning) plus its
// neighbours for Prev / Next at-bat, from the same matchups endpoint the
// "Find at-bats" panel uses. Desktop and mobile chrome both mount, so
// requests are shared through a small in-memory promise cache.

export interface MatchupAtBat {
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

interface MatchupsBody {
  batterName: string;
  atBats: MatchupAtBat[];
}

const cache = new Map<string, Promise<MatchupsBody | null>>();
function load(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<MatchupsBody>) : null))
      .catch(() => null);
    cache.set(url, p);
    // Let a later visit refetch.
    setTimeout(() => cache.delete(url), 60_000);
  }
  return p;
}

export interface AtBatInfo {
  batterId: number;
  batterName: string;
  /** Chronological at-bats vs this batter (the season). */
  all: MatchupAtBat[];
  current: MatchupAtBat | null;
  prev: MatchupAtBat | null;
  next: MatchupAtBat | null;
}

export function useAtBatInfo(season: number): AtBatInfo | null {
  const params = useParams<{ id?: string }>();
  const sp = useSearchParams();
  const pitcherId = params?.id;
  const batterId = Number(sp.get("vsBatter"));
  const abGame = Number(sp.get("abGame"));
  const abNum = Number(sp.get("abNum"));
  const [body, setBody] = useState<{ key: string; data: MatchupsBody | null } | null>(null);

  const url =
    pitcherId && batterId ? `/api/pitcher/${pitcherId}/matchups?batterId=${batterId}&season=${season}` : null;

  useEffect(() => {
    if (!url) return;
    let live = true;
    load(url).then((data) => {
      if (live) setBody({ key: url, data });
    });
    return () => {
      live = false;
    };
  }, [url]);

  if (!url || !body || body.key !== url || !body.data) return null;
  const all = body.data.atBats;
  const i = all.findIndex((a) => a.game_pk === abGame && a.at_bat_number === abNum);
  return {
    batterId,
    batterName: body.data.batterName,
    all,
    current: i >= 0 ? all[i] : null,
    prev: i > 0 ? all[i - 1] : null,
    next: i >= 0 && i < all.length - 1 ? all[i + 1] : null,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "May 19, 2026" (long) or "May 19" (short). */
export function formatGameDate(iso: string, long = true): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!m || !d) return iso;
  return long ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`;
}

/** Last name for tight headers ("Crow-Armstrong"). */
export function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv)$/i;
  const last = parts.length > 1 && suffix.test(parts[parts.length - 1]) ? parts[parts.length - 2] : parts[parts.length - 1];
  return last ?? full;
}

/** "P. Crow-Armstrong". */
export function initialLast(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

export async function shareAtBat(title: string): Promise<"shared" | "copied" | "failed"> {
  const url = window.location.href;
  try {
    // Native share sheet on touch devices; desktop copies the link.
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
