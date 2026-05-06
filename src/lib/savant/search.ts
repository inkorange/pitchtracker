// Typed wrapper around Baseball Savant's statcast_search endpoint.
// Phase 5 (outcome mining): we host the query UX + visualization,
// Savant hosts the data.
//
// The SearchQuery object is the source of truth — it serializes into
// Savant URL params for the fetch, and (in the API layer) becomes the
// cache tag for repeat-query dedup.

import { castRow, parseCsv, type SavantPitchRow } from "./client";

const SEARCH_BASE = "https://baseballsavant.mlb.com/statcast_search/csv";

// Result cap. Wider queries return a "narrow your filter" prompt in
// the UI rather than a partial dataset. Picked to protect Savant + our
// function memory/timeouts; ~5MB of CSV at this cap.
export const MAX_RESULTS = 5000;

export interface SearchQuery {
  // Who
  pitcherIds?: number[];
  batterIds?: number[];
  pitcherThrows?: "L" | "R";
  batterStands?: "L" | "R";

  // What — Statcast 2-letter pitch codes (FF, SL, CH, ...).
  pitchTypes?: string[];

  // When
  seasons?: number[];
  /** Inclusive lower bound, YYYY-MM-DD. */
  gameDateFrom?: string;
  /** Inclusive upper bound, YYYY-MM-DD. */
  gameDateTo?: string;
  /** Counts as "B-S" strings — "0-0", "3-2", etc. */
  counts?: string[];
  /** Outs (0, 1, 2). */
  outs?: number[];
  /** Inning numbers. */
  innings?: number[];
  /** Game type codes: R, P, S, F, D, L, W, A. */
  gameTypes?: string[];

  // Outcome
  /** Per-pitch description: ball, called_strike, swinging_strike, foul, hit_into_play, ... */
  descriptions?: string[];
  /** At-bat event: strikeout, single, double, home_run, walk, ... */
  events?: string[];
  /** ground_ball, line_drive, fly_ball, popup. */
  battedBallTypes?: string[];
  /** Statcast attack-zone codes 1–14. */
  zones?: number[];

  // Limits
  /** Hard cap on returned rows (default MAX_RESULTS). */
  limit?: number;
}

/**
 * Convert a typed query into Savant's URL search params. List fields
 * use Savant's pipe-separated convention with a trailing pipe (e.g.
 * "FF|SL|"). Pitcher / batter ID lists use the literal `[]` suffix
 * URLSearchParams percent-encodes — Savant accepts both forms.
 */
export function serializeSearchQuery(q: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set("all", "true");
  params.set("type", "details");

  // Savant uses pipe-separated lists with a trailing pipe.
  const pipeJoin = (xs: ReadonlyArray<string | number>) =>
    xs.length ? xs.map(String).join("|") + "|" : "";

  if (q.pitchTypes?.length) params.set("hfPT", pipeJoin(q.pitchTypes));
  if (q.descriptions?.length) params.set("hfPR", pipeJoin(q.descriptions));
  if (q.events?.length) params.set("hfAB", pipeJoin(q.events));
  if (q.counts?.length) {
    // Savant packs counts as two-digit codes (BS): "0-0" → "00",
    // "3-2" → "32". Sending the dashed form returns zero rows.
    params.set(
      "hfC",
      pipeJoin(q.counts.map((c) => c.replace(/[^0-9]/g, ""))),
    );
  }
  if (q.outs?.length) params.set("hfOuts", pipeJoin(q.outs));
  if (q.innings?.length) params.set("hfInn", pipeJoin(q.innings));
  if (q.zones?.length) params.set("hfZ", pipeJoin(q.zones));
  if (q.battedBallTypes?.length) params.set("hfBBT", pipeJoin(q.battedBallTypes));
  if (q.gameTypes?.length) params.set("hfGT", pipeJoin(q.gameTypes));
  if (q.seasons?.length) params.set("hfSea", pipeJoin(q.seasons));

  if (q.pitcherThrows) params.set("pitcher_throws", q.pitcherThrows);
  if (q.batterStands) params.set("batter_stands", q.batterStands);
  if (q.gameDateFrom) params.set("game_date_gt", q.gameDateFrom);
  if (q.gameDateTo) params.set("game_date_lt", q.gameDateTo);

  // Multi-value list params. Savant's UI renders these as
  // pitchers_lookup[]= repeated entries; we replicate that.
  q.pitcherIds?.forEach((id) =>
    params.append("pitchers_lookup[]", String(id)),
  );
  q.batterIds?.forEach((id) =>
    params.append("batters_lookup[]", String(id)),
  );

  return params;
}

/**
 * Stable string form of a query — used as a cache tag for the
 * /api/search Vercel Runtime Cache layer. Sorting list fields makes
 * `["FF","SL"]` and `["SL","FF"]` collapse to the same tag.
 */
export function searchQueryCacheKey(q: SearchQuery): string {
  const sortedListField = (xs: ReadonlyArray<string | number> | undefined) =>
    xs ? [...xs].sort() : undefined;
  const normalized: SearchQuery = {
    pitcherIds: sortedListField(q.pitcherIds) as number[] | undefined,
    batterIds: sortedListField(q.batterIds) as number[] | undefined,
    pitcherThrows: q.pitcherThrows,
    batterStands: q.batterStands,
    pitchTypes: sortedListField(q.pitchTypes) as string[] | undefined,
    seasons: sortedListField(q.seasons) as number[] | undefined,
    gameDateFrom: q.gameDateFrom,
    gameDateTo: q.gameDateTo,
    counts: sortedListField(q.counts) as string[] | undefined,
    outs: sortedListField(q.outs) as number[] | undefined,
    innings: sortedListField(q.innings) as number[] | undefined,
    gameTypes: sortedListField(q.gameTypes) as string[] | undefined,
    descriptions: sortedListField(q.descriptions) as string[] | undefined,
    events: sortedListField(q.events) as string[] | undefined,
    battedBallTypes: sortedListField(q.battedBallTypes) as string[] | undefined,
    zones: sortedListField(q.zones) as number[] | undefined,
    limit: q.limit,
  };
  // Strip undefined so the cache key reflects only set filters.
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(normalized)) {
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    stripped[k] = v;
  }
  return JSON.stringify(stripped);
}

export interface SearchResult {
  rows: SavantPitchRow[];
  /** Savant returned more rows than `limit`; the result was truncated. */
  truncated: boolean;
  /** Total rows Savant returned before applying the limit. */
  totalReturned: number;
}

/**
 * Run a typed search against Baseball Savant. Caps the returned rows
 * at `query.limit` (default MAX_RESULTS) and flags `truncated` when
 * Savant returned more — the UI uses that to surface a "narrow your
 * filter" prompt.
 */
export async function searchPitches(
  query: SearchQuery,
  options: { signal?: AbortSignal } = {},
): Promise<SearchResult> {
  const params = serializeSearchQuery(query);
  const url = `${SEARCH_BASE}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: "text/csv",
      "User-Agent":
        "pitchtracker/0.1 (+https://github.com/inkorange/pitchtracker)",
    },
    cache: "no-store",
    signal: options.signal,
  });
  if (!res.ok) {
    throw new Error(`Savant search ${res.status}`);
  }
  const csv = await res.text();
  const parsed = parseCsv(csv);
  const limit = query.limit ?? MAX_RESULTS;
  const truncated = parsed.length > limit;
  const rows = parsed.slice(0, limit).map(castRow);
  return { rows, truncated, totalReturned: parsed.length };
}
