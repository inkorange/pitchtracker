import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  MAX_RESULTS,
  searchPitches,
  searchQueryCacheKey,
  type SearchQuery,
} from "@/lib/savant/search";
import { computeAggregates, type SearchAggregates } from "@/lib/savant/aggregates";
import type { SavantPitchRow } from "@/lib/savant/client";

// Wide queries can spend a lot of time in the Savant fetch + CSV
// parse, especially on cold cache. Bumping max duration past the
// default 10s gives us room without dropping outright on a 5,000-row
// result.
export const maxDuration = 60;

interface SearchResponseBody {
  rows: SavantPitchRow[];
  truncated: boolean;
  totalReturned: number;
  aggregates: SearchAggregates;
  cacheKey: string;
}

// Tagged cache wrapper around searchPitches + computeAggregates. The
// cache key (deterministic JSON of the sorted query) keys the entry;
// the tags let us invalidate either the whole search namespace or a
// specific query if the upstream data shifts. Revalidate every 6
// hours — Statcast occasionally backfills retroactive corrections, but
// the search results aren't time-critical.
const CACHE_REVALIDATE_S = 60 * 60 * 6;

const cachedSearch = unstable_cache(
  async (
    query: SearchQuery,
    // cacheKey is included in the args (and therefore the cache key)
    // so reordered list fields collapse to one entry; we don't read it
    // here, just rely on unstable_cache to memoize on its identity.
    cacheKey: string,
  ): Promise<Omit<SearchResponseBody, "cacheKey">> => {
    void cacheKey;
    const { rows, truncated, totalReturned } = await searchPitches(query);
    const aggregates = computeAggregates(rows);
    return { rows, truncated, totalReturned, aggregates };
  },
  ["savant-search"],
  {
    revalidate: CACHE_REVALIDATE_S,
    tags: ["savant-search"],
  },
);

/**
 * Validate the request body shape just enough to refuse obvious junk.
 * Full SearchQuery validation lives in the typed client — this layer
 * exists to drop responses on malformed inputs (non-object, wrong list
 * types) instead of forwarding garbage to Savant.
 */
function parseQuery(input: unknown): SearchQuery | { error: string } {
  if (typeof input !== "object" || input === null) {
    return { error: "Body must be a JSON object." };
  }
  const obj = input as Record<string, unknown>;

  const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");
  const isNumberArray = (v: unknown): v is number[] =>
    Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x));

  // Spot-check the array fields. Untyped fields are passed through but
  // serializeSearchQuery treats unknowns as undefined, so the worst
  // case is a malformed entry being silently dropped.
  for (const k of [
    "pitchTypes",
    "counts",
    "gameTypes",
    "descriptions",
    "events",
    "battedBallTypes",
  ]) {
    if (k in obj && obj[k] !== undefined && !isStringArray(obj[k])) {
      return { error: `${k} must be a string[]` };
    }
  }
  for (const k of ["pitcherIds", "batterIds", "seasons", "outs", "innings", "zones"]) {
    if (k in obj && obj[k] !== undefined && !isNumberArray(obj[k])) {
      return { error: `${k} must be a number[]` };
    }
  }
  if (
    "pitcherThrows" in obj &&
    obj.pitcherThrows !== undefined &&
    obj.pitcherThrows !== "L" &&
    obj.pitcherThrows !== "R"
  ) {
    return { error: "pitcherThrows must be 'L' or 'R'" };
  }
  if (
    "batterStands" in obj &&
    obj.batterStands !== undefined &&
    obj.batterStands !== "L" &&
    obj.batterStands !== "R"
  ) {
    return { error: "batterStands must be 'L' or 'R'" };
  }
  if (obj.limit !== undefined) {
    if (typeof obj.limit !== "number" || !Number.isFinite(obj.limit) || obj.limit <= 0) {
      return { error: "limit must be a positive number" };
    }
    if (obj.limit > MAX_RESULTS) {
      return {
        error: `limit cannot exceed ${MAX_RESULTS}; narrow your filter or page client-side.`,
      };
    }
  }
  return obj as SearchQuery;
}

/**
 * Refuses queries with no filters at all so we don't accidentally
 * stream a season's worth of data on every empty form submit.
 */
function hasAnyFilter(q: SearchQuery): boolean {
  return Boolean(
    q.pitcherIds?.length ||
      q.batterIds?.length ||
      q.pitcherThrows ||
      q.batterStands ||
      q.pitchTypes?.length ||
      q.seasons?.length ||
      q.gameDateFrom ||
      q.gameDateTo ||
      q.counts?.length ||
      q.outs?.length ||
      q.innings?.length ||
      q.gameTypes?.length ||
      q.descriptions?.length ||
      q.events?.length ||
      q.battedBallTypes?.length ||
      q.zones?.length,
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseQuery(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const query = parsed;

  if (!hasAnyFilter(query)) {
    return NextResponse.json(
      { error: "Add at least one filter — empty queries are blocked." },
      { status: 400 },
    );
  }

  const cacheKey = searchQueryCacheKey(query);

  try {
    const cached = await cachedSearch(query, cacheKey);
    const response: SearchResponseBody = { ...cached, cacheKey };
    return NextResponse.json(response, {
      headers: {
        // CDN can also cache for the same revalidate window; the route
        // is idempotent for a given body.
        "cache-control": `public, max-age=${CACHE_REVALIDATE_S}, s-maxage=${CACHE_REVALIDATE_S}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
