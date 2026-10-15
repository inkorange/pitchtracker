import { describe, expect, it } from "vitest";
import {
  COMPETITIVE_GAME_TYPES,
  fallbackDisplaySeason,
} from "../current-season";

// Dates are constructed via Date.UTC and read back with local getters
// in fallbackDisplaySeason, so tests use midday UTC to stay on the
// intended calendar day regardless of the runner's timezone.
const at = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

describe("fallbackDisplaySeason", () => {
  it("returns the previous year on January 1 — the bug this exists to prevent", () => {
    // The whole point: on 2027-01-01 there is no 2027 data and will be
    // none until spring. Treating it as season 2027 emptied every
    // season-scoped surface and armed the eviction cron to delete 2026.
    expect(fallbackDisplaySeason(at(2027, 1, 1))).toBe(2026);
  });

  it("stays on the previous season through the offseason", () => {
    expect(fallbackDisplaySeason(at(2027, 1, 15))).toBe(2026);
    expect(fallbackDisplaySeason(at(2027, 2, 28))).toBe(2026);
    expect(fallbackDisplaySeason(at(2027, 3, 31))).toBe(2026);
  });

  it("rolls over to the new season on April 1", () => {
    expect(fallbackDisplaySeason(at(2027, 3, 31))).toBe(2026);
    expect(fallbackDisplaySeason(at(2027, 4, 1))).toBe(2027);
  });

  it("returns the current year through the season and postseason", () => {
    expect(fallbackDisplaySeason(at(2026, 4, 1))).toBe(2026);
    expect(fallbackDisplaySeason(at(2026, 7, 4))).toBe(2026);
    // Mid-playoffs — the window where postseason ingest was broken.
    expect(fallbackDisplaySeason(at(2026, 10, 15))).toBe(2026);
    expect(fallbackDisplaySeason(at(2026, 12, 31))).toBe(2026);
  });

  it("handles leap years without shifting the rollover", () => {
    expect(fallbackDisplaySeason(at(2028, 2, 29))).toBe(2027);
    expect(fallbackDisplaySeason(at(2028, 4, 1))).toBe(2028);
  });
});

describe("COMPETITIVE_GAME_TYPES", () => {
  it("covers the regular season and all four postseason rounds", () => {
    // Omitting the postseason codes is what left the 2026 playoffs
    // with zero cached pitches.
    expect([...COMPETITIVE_GAME_TYPES].sort()).toEqual([
      "D", // division series
      "F", // wild card
      "L", // league championship
      "R", // regular season
      "W", // World Series
    ]);
  });

  it("excludes spring training, exhibition and all-star", () => {
    for (const code of ["S", "E", "A"]) {
      expect(COMPETITIVE_GAME_TYPES).not.toContain(code);
    }
  });
});
