import { describe, expect, it } from "vitest";
import {
  aggregateVelocityLeaders,
  parseStrikeoutLeaders,
  __testables,
} from "../external";
import type { SavantPitchRow } from "@/lib/savant/client";

function pitch(pitcher: number, release_speed: number | undefined) {
  return { pitcher, release_speed } as unknown as SavantPitchRow;
}

/** n pitches for one pitcher, all at the same speed. */
function many(pitcher: number, speed: number, n: number) {
  return Array.from({ length: n }, () => pitch(pitcher, speed));
}

describe("aggregateVelocityLeaders", () => {
  it("averages release speed per pitcher and ranks fastest first", () => {
    const rows = [...many(1, 95, 20), ...many(2, 99, 20), ...many(3, 97, 20)];
    const out = aggregateVelocityLeaders(rows, { limit: 10, minPitches: 20 });
    expect(out.map((r) => [r.rank, r.pitcher_id, r.avg_velo])).toEqual([
      [1, 2, 99],
      [2, 3, 97],
      [3, 1, 95],
    ]);
  });

  it("drops pitchers below the minimum pitch count", () => {
    // A reliever with three 103 mph pitches must not top the board.
    const rows = [...many(1, 103, 3), ...many(2, 96, 20)];
    const out = aggregateVelocityLeaders(rows, { limit: 10, minPitches: 20 });
    expect(out.map((r) => r.pitcher_id)).toEqual([2]);
  });

  it("counts pitches in fb_pitches", () => {
    const out = aggregateVelocityLeaders(many(7, 98, 34), {
      limit: 10,
      minPitches: 20,
    });
    expect(out[0].fb_pitches).toBe(34);
  });

  it("rounds to a tenth, matching the view it replaces", () => {
    // round(avg(...), 1) in SQL; (95 + 96 + 96) / 3 = 95.666...
    const rows = [
      ...many(1, 95, 1),
      ...many(1, 96, 2),
      // pad to clear minPitches without moving the mean
      ...Array.from({ length: 17 }, () => pitch(1, 95.6667)),
    ];
    const out = aggregateVelocityLeaders(rows, { limit: 10, minPitches: 20 });
    expect(out[0].avg_velo).toBeCloseTo(95.7, 5);
  });

  it("ignores rows with a missing or non-numeric speed", () => {
    const rows = [
      ...many(1, 97, 20),
      pitch(1, undefined),
      pitch(1, Number.NaN),
    ];
    const out = aggregateVelocityLeaders(rows, { limit: 10, minPitches: 20 });
    // The two bad rows must not count toward fb_pitches or drag the mean.
    expect(out[0].fb_pitches).toBe(20);
    expect(out[0].avg_velo).toBe(97);
  });

  it("applies the limit after ranking, not before", () => {
    const rows = [
      ...many(1, 92, 20),
      ...many(2, 99, 20),
      ...many(3, 95, 20),
    ];
    const out = aggregateVelocityLeaders(rows, { limit: 2, minPitches: 20 });
    expect(out.map((r) => r.pitcher_id)).toEqual([2, 3]);
  });

  it("breaks ties deterministically so ordering is stable across requests", () => {
    // Equal averages: more pitches wins, then lower id. Without this the
    // order would depend on Map iteration and could differ per render.
    const rows = [...many(5, 97, 20), ...many(4, 97, 30), ...many(9, 97, 20)];
    const out = aggregateVelocityLeaders(rows, { limit: 10, minPitches: 20 });
    expect(out.map((r) => r.pitcher_id)).toEqual([4, 5, 9]);
  });

  it("returns an empty board for no rows — the offseason case", () => {
    expect(aggregateVelocityLeaders([], { limit: 10, minPitches: 20 })).toEqual(
      [],
    );
  });
});

describe("parseStrikeoutLeaders", () => {
  // Shape mirrors a real response from
  // statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=strikeouts
  const body = {
    leagueLeaders: [
      {
        leaderCategory: "strikeouts",
        leaders: [
          { rank: 1, value: "252", person: { id: 694819 } },
          { rank: 2, value: "248", person: { id: 100002 } },
          { rank: 3, value: "239", person: { id: 100003 } },
          { rank: 3, value: "239", person: { id: 100004 } },
          { rank: 5, value: "231", person: { id: 100005 } },
        ],
      },
    ],
  };

  it("parses ids and values, preserving MLB's ranks", () => {
    const out = parseStrikeoutLeaders(body, 10);
    expect(out[0]).toEqual({ rank: 1, pitcher_id: 694819, strikeouts: 252 });
    expect(out).toHaveLength(5);
  });

  it("keeps repeated ranks on ties rather than renumbering", () => {
    const out = parseStrikeoutLeaders(body, 10);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3, 3, 5]);
  });

  it("coerces the string values MLB returns into numbers", () => {
    const out = parseStrikeoutLeaders(body, 10);
    for (const r of out) expect(typeof r.strikeouts).toBe("number");
  });

  it("honors the limit", () => {
    expect(parseStrikeoutLeaders(body, 2).map((r) => r.pitcher_id)).toEqual([
      694819, 100002,
    ]);
  });

  it("ignores entries missing an id or a value", () => {
    const partial = {
      leagueLeaders: [
        {
          leaderCategory: "strikeouts",
          leaders: [
            { rank: 1, value: "10", person: {} },
            { rank: 2, person: { id: 5 } },
            { rank: 3, value: "8", person: { id: 6 } },
          ],
        },
      ],
    };
    expect(parseStrikeoutLeaders(partial, 10)).toEqual([
      { rank: 3, pitcher_id: 6, strikeouts: 8 },
    ]);
  });

  it("returns empty when the category is absent", () => {
    expect(parseStrikeoutLeaders({ leagueLeaders: [] }, 10)).toEqual([]);
    expect(parseStrikeoutLeaders({}, 10)).toEqual([]);
  });
});


describe("velocityWindow", () => {
  const { velocityWindow } = __testables;
  const at = (iso: string) => new Date(iso);

  it("produces a window of exactly `days` calendar days", () => {
    // Savant's bounds are inclusive on both ends, so a 7-day window
    // ending today starts at today-6. Using today-7 silently widened
    // this to 8 days and inflated every average's sample.
    const w = velocityWindow(7, at("2026-08-07T18:00:00Z"));
    expect(w).toEqual({ dateFrom: "2026-08-01", dateTo: "2026-08-07" });
  });

  it("matches the window the materialized view used", () => {
    // The view filtered `game_date > current_date - 7`, i.e. the 7 days
    // ending today. This is the exact window that reproduced all ten
    // of its rows when compared against Savant.
    const w = velocityWindow(7, at("2026-08-07T00:00:00Z"));
    const from = Date.parse(`${w.dateFrom}T00:00:00Z`);
    const to = Date.parse(`${w.dateTo}T00:00:00Z`);
    expect((to - from) / 86_400_000 + 1).toBe(7);
  });

  it("collapses to a single day for days = 1", () => {
    const w = velocityWindow(1, at("2026-08-07T12:00:00Z"));
    expect(w.dateFrom).toBe(w.dateTo);
  });

  it("does not run backwards for a nonsensical days value", () => {
    const w = velocityWindow(0, at("2026-08-07T12:00:00Z"));
    expect(w.dateFrom).toBe("2026-08-07");
    expect(w.dateTo).toBe("2026-08-07");
  });
});
