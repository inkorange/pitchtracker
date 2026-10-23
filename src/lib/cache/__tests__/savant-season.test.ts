import { describe, expect, it } from "vitest";
import {
  filterSeasonPitches,
  __testables,
  type SavantSeasonPitchRow,
} from "../savant-season";
import type { SavantPitchRow } from "@/lib/savant/client";

const { shapeSavantSeason } = __testables;

const TEAMS = new Map<string, number>([
  ["NYY", 147],
  ["BOS", 111],
]);

// Minimal Savant row; only the fields the shaper reads are meaningful.
function row(over: Partial<SavantPitchRow> = {}): SavantPitchRow {
  return {
    game_pk: 1,
    game_date: "2025-07-04",
    game_type: "R",
    pitcher: 694973,
    batter: 500,
    at_bat_number: 1,
    pitch_number: 1,
    balls: 0,
    strikes: 0,
    outs_when_up: 0,
    inning: 1,
    inning_topbot: "Top",
    on_1b: null,
    on_2b: null,
    on_3b: null,
    release_extension: 6.5,
    delta_run_exp: null,
    home_team: "NYY",
    away_team: "BOS",
    stand: "R",
    pitch_type: "FF",
    description: "called_strike",
    events: undefined,
    release_pos_x: -1,
    release_pos_y: 54,
    release_pos_z: 6,
    vx0: 5,
    vy0: -135,
    vz0: -5,
    ax: -10,
    ay: 30,
    az: -15,
    plate_x: 0,
    plate_z: 2.5,
    release_speed: 98,
    release_spin_rate: 2400,
    spin_axis: 200,
    pfx_x: 0.5,
    pfx_z: 1.5,
    ...over,
  } as SavantPitchRow;
}

describe("shapeSavantSeason", () => {
  it("resolves Savant team abbreviations to MLB team ids", () => {
    // Savant gives "NYY"; every consumer downstream wants 147.
    const { pitches } = shapeSavantSeason([row()], 2025, TEAMS);
    expect(pitches[0].pitch_games.home_team_id).toBe(147);
    expect(pitches[0].pitch_games.away_team_id).toBe(111);
  });

  it("leaves team ids null for an unknown abbreviation rather than guessing", () => {
    const { pitches } = shapeSavantSeason(
      [row({ home_team: "ZZZ" })],
      2025,
      TEAMS,
    );
    expect(pitches[0].pitch_games.home_team_id).toBeNull();
  });

  it("stamps the requested season and truncates the game date", () => {
    const { pitches } = shapeSavantSeason(
      [row({ game_date: "2025-07-04T00:00:00" })],
      2025,
      TEAMS,
    );
    expect(pitches[0].pitch_games.season).toBe(2025);
    expect(pitches[0].pitch_games.game_date).toBe("2025-07-04");
  });

  it("orders pitches by game, then at-bat, then pitch — matching the SQL path", () => {
    // Indices into this array are used by ?pitch= and the 3D scene, so
    // the two sources must agree on order.
    const { pitches } = shapeSavantSeason(
      [
        row({ game_pk: 2, at_bat_number: 1, pitch_number: 1 }),
        row({ game_pk: 1, at_bat_number: 2, pitch_number: 2 }),
        row({ game_pk: 1, at_bat_number: 1, pitch_number: 3 }),
        row({ game_pk: 1, at_bat_number: 2, pitch_number: 1 }),
      ],
      2025,
      TEAMS,
    );
    expect(
      pitches.map((p) => [p.game_pk, p.at_bat_number, p.pitch_number]),
    ).toEqual([
      [1, 1, 3],
      [1, 2, 1],
      [1, 2, 2],
      [2, 1, 1],
    ]);
  });

  it("derives arsenal counts and mean velocity, heaviest pitch first", () => {
    const { arsenal } = shapeSavantSeason(
      [
        row({ pitch_type: "SL", release_speed: 86 }),
        row({ pitch_type: "FF", release_speed: 98 }),
        row({ pitch_type: "FF", release_speed: 100 }),
      ],
      2025,
      TEAMS,
    );
    expect(arsenal.map((a) => a.pitch_type)).toEqual(["FF", "SL"]);
    expect(arsenal[0].pitch_count).toBe(2);
    expect(arsenal[0].avg_velocity).toBeCloseTo(99, 5);
  });

  it("reports null velocity rather than 0 when no pitch has a reading", () => {
    // A 0 here would render as "0.0 mph" in the arsenal card.
    const { arsenal } = shapeSavantSeason(
      [row({ pitch_type: "FF", release_speed: undefined })],
      2025,
      TEAMS,
    );
    expect(arsenal[0].pitch_count).toBe(1);
    expect(arsenal[0].avg_velocity).toBeNull();
  });

  it("skips rows with no pitch type instead of bucketing them together", () => {
    const { arsenal } = shapeSavantSeason(
      [row({ pitch_type: "" }), row({ pitch_type: "FF" })],
      2025,
      TEAMS,
    );
    expect(arsenal).toHaveLength(1);
    expect(arsenal[0].pitch_type).toBe("FF");
  });

  it("dedupes games by game_pk, newest first", () => {
    const { games } = shapeSavantSeason(
      [
        row({ game_pk: 10, game_date: "2025-04-01" }),
        row({ game_pk: 10, game_date: "2025-04-01", pitch_number: 2 }),
        row({ game_pk: 20, game_date: "2025-09-01" }),
      ],
      2025,
      TEAMS,
    );
    expect(games.map((g) => g.game_pk)).toEqual([20, 10]);
  });

  it("returns empty collections for no rows, not undefined", () => {
    const out = shapeSavantSeason([], 2025, TEAMS);
    expect(out).toEqual({ pitches: [], arsenal: [], games: [] });
  });
});

describe("filterSeasonPitches", () => {
  const base = shapeSavantSeason(
    [
      row({ game_pk: 1, pitch_number: 1, stand: "L", batter: 100 }),
      row({ game_pk: 1, pitch_number: 2, stand: "R", batter: 200 }),
      row({ game_pk: 2, pitch_number: 1, stand: "R", batter: 100 }),
    ],
    2025,
    TEAMS,
  ).pitches;

  const ids = (rows: SavantSeasonPitchRow[]) =>
    rows.map((p) => `${p.game_pk}-${p.pitch_number}`);

  it("passes everything through when no filter is set", () => {
    expect(ids(filterSeasonPitches(base, {}))).toEqual([
      "1-1",
      "1-2",
      "2-1",
    ]);
  });

  it("filters by batter handedness", () => {
    expect(ids(filterSeasonPitches(base, { hand: "L" }))).toEqual(["1-1"]);
  });

  it("ignores a handedness value that isn't L or R", () => {
    // ?hand=both and junk values mean "no filter", same as the SQL path.
    expect(filterSeasonPitches(base, { hand: "both" })).toHaveLength(3);
  });

  it("filters by game", () => {
    expect(ids(filterSeasonPitches(base, { gamePk: 2 }))).toEqual(["2-1"]);
  });

  it("filters by opposing batter", () => {
    expect(ids(filterSeasonPitches(base, { vsBatterId: 100 }))).toEqual([
      "1-1",
      "2-1",
    ]);
  });

  it("applies filters together", () => {
    expect(
      ids(filterSeasonPitches(base, { hand: "R", vsBatterId: 100 })),
    ).toEqual(["2-1"]);
  });

  it("treats null and undefined filters as absent", () => {
    expect(
      filterSeasonPitches(base, {
        hand: null,
        gamePk: null,
        vsBatterId: null,
      }),
    ).toHaveLength(3);
  });
});
