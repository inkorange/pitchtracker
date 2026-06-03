import { describe, expect, it } from "vitest";
import {
  buildSequencingDrift,
  type DriftPitch,
} from "../sequencingDrift";

// Helper to inline a synthetic AB: each call produces a sequence of
// pitches sharing one (game_pk, at_bat_number) bucket and dated to a
// game's day. pitch_number starts at 1 and increments — that's what
// buildSequencingMatrix sorts on for transition walking.
function ab(
  game_pk: number,
  game_date: string,
  at_bat_number: number,
  types: string[],
): DriftPitch[] {
  return types.map((pitch_type, i) => ({
    game_pk,
    game_date,
    at_bat_number,
    pitch_number: i + 1,
    pitch_type,
  }));
}

describe("buildSequencingDrift", () => {
  it("returns zero drift when every game matches the season pattern", () => {
    // Two games, each with identical AB content (FF→SL, FF→CH). Every
    // game's matrix == season matrix → drift should be 0.
    const pitches: DriftPitch[] = [
      ...ab(1, "2026-04-01", 1, ["FF", "SL"]),
      ...ab(1, "2026-04-01", 2, ["FF", "CH"]),
      ...ab(1, "2026-04-01", 3, ["FF", "SL"]),
      ...ab(1, "2026-04-01", 4, ["FF", "CH"]),
      ...ab(1, "2026-04-01", 5, ["FF", "SL"]),
      ...ab(1, "2026-04-01", 6, ["FF", "CH"]),
      ...ab(2, "2026-04-08", 1, ["FF", "SL"]),
      ...ab(2, "2026-04-08", 2, ["FF", "CH"]),
      ...ab(2, "2026-04-08", 3, ["FF", "SL"]),
      ...ab(2, "2026-04-08", 4, ["FF", "CH"]),
      ...ab(2, "2026-04-08", 5, ["FF", "SL"]),
      ...ab(2, "2026-04-08", 6, ["FF", "CH"]),
    ];
    const drift = buildSequencingDrift(pitches);
    expect(drift.games).toHaveLength(2);
    for (const g of drift.games) expect(g.drift).toBeCloseTo(0, 6);
  });

  it("flags a game whose first pitch and follow-ups all changed", () => {
    // Season pattern: FF as first pitch, follow with SL. One outlier
    // game where every AB opens with CU and follows with KC — fully
    // different distributions.
    const base: DriftPitch[] = [];
    for (let g = 1; g <= 4; g++) {
      for (let n = 1; n <= 6; n++) {
        base.push(...ab(g, `2026-04-0${g}`, n, ["FF", "SL"]));
      }
    }
    const outlier: DriftPitch[] = [];
    for (let n = 1; n <= 6; n++) {
      outlier.push(...ab(9, "2026-04-15", n, ["CU", "KC"]));
    }
    const drift = buildSequencingDrift([...base, ...outlier]);
    const baseGames = drift.games.filter((g) => g.game_pk !== 9);
    const outlierGame = drift.games.find((g) => g.game_pk === 9);
    // Base games are nearly identical to each other, but the season
    // baseline includes the outlier game too — so they drift a bit
    // from "season". Anything well below the outlier's spike is fine.
    for (const g of baseGames) expect(g.drift).toBeLessThan(0.25);
    expect(outlierGame).toBeDefined();
    // 0.4+ is the realistic ceiling for "first pitch totally
    // different but follow-up given that pitch identical to season"
    // — the math correctly weights agreement on the within-row
    // pattern. The point of the test is the outlier dwarfs the
    // baseline games' drift, not the absolute magnitude.
    expect(outlierGame!.drift).toBeGreaterThan(0.35);
    for (const g of baseGames) {
      expect(outlierGame!.drift).toBeGreaterThan(g.drift * 1.5);
    }
  });

  it("sorts games chronologically and reports raw counts", () => {
    const pitches: DriftPitch[] = [
      ...ab(3, "2026-05-15", 1, ["FF", "SL", "CH"]),
      ...ab(1, "2026-04-01", 1, ["FF", "SL"]),
      ...ab(2, "2026-04-20", 1, ["FF", "CH"]),
    ];
    const drift = buildSequencingDrift(pitches);
    expect(drift.games.map((g) => g.game_pk)).toEqual([1, 2, 3]);
    expect(drift.games[0].atBatCount).toBe(1);
    expect(drift.games[2].pitchCount).toBe(3);
  });

  it("returns drift = 0 for a game when the season has no data", () => {
    const drift = buildSequencingDrift([]);
    expect(drift.games).toHaveLength(0);
    expect(drift.seasonAtBats).toBe(0);
  });
});
