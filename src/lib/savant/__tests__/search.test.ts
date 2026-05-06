import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MAX_RESULTS,
  searchPitches,
  searchQueryCacheKey,
  serializeSearchQuery,
  type SearchQuery,
} from "../search";

describe("serializeSearchQuery", () => {
  it("always sets the static `all`/`type` flags", () => {
    const params = serializeSearchQuery({});
    expect(params.get("all")).toBe("true");
    expect(params.get("type")).toBe("details");
  });

  it("omits filter params when the corresponding fields are empty/undefined", () => {
    const params = serializeSearchQuery({ pitchTypes: [], events: undefined });
    expect(params.has("hfPT")).toBe(false);
    expect(params.has("hfAB")).toBe(false);
    expect(params.has("pitcher_throws")).toBe(false);
    expect(params.has("game_date_gt")).toBe(false);
  });

  it("pipe-joins list fields with a trailing pipe", () => {
    const params = serializeSearchQuery({
      pitchTypes: ["FF", "SL", "CH"],
      counts: ["0-0", "3-2"],
      seasons: [2024, 2025],
      outs: [0, 1, 2],
      zones: [1, 5, 9],
    });
    expect(params.get("hfPT")).toBe("FF|SL|CH|");
    // Counts pack as two-digit codes (BS) for Savant's hfC param.
    expect(params.get("hfC")).toBe("00|32|");
    expect(params.get("hfSea")).toBe("2024|2025|");
    expect(params.get("hfOuts")).toBe("0|1|2|");
    expect(params.get("hfZ")).toBe("1|5|9|");
  });

  it("maps single-valued fields to Savant param names", () => {
    const params = serializeSearchQuery({
      pitcherThrows: "R",
      batterStands: "L",
      gameDateFrom: "2024-04-01",
      gameDateTo: "2024-09-30",
    });
    expect(params.get("pitcher_throws")).toBe("R");
    expect(params.get("batter_stands")).toBe("L");
    expect(params.get("game_date_gt")).toBe("2024-04-01");
    expect(params.get("game_date_lt")).toBe("2024-09-30");
  });

  it("appends each pitcher/batter id under the bracket-suffixed key", () => {
    const params = serializeSearchQuery({
      pitcherIds: [669373, 663855],
      batterIds: [592450],
    });
    // URLSearchParams.getAll preserves insertion order and exposes the
    // raw key — even though `toString()` percent-encodes the brackets.
    expect(params.getAll("pitchers_lookup[]")).toEqual(["669373", "663855"]);
    expect(params.getAll("batters_lookup[]")).toEqual(["592450"]);
    // Sanity check the wire format.
    expect(params.toString()).toContain("pitchers_lookup%5B%5D=669373");
    expect(params.toString()).toContain("batters_lookup%5B%5D=592450");
  });

  it("maps outcome-shaped fields to their distinct Savant params", () => {
    const params = serializeSearchQuery({
      descriptions: ["swinging_strike", "called_strike"],
      events: ["strikeout", "single", "home_run"],
      battedBallTypes: ["line_drive", "fly_ball"],
    });
    expect(params.get("hfPR")).toBe("swinging_strike|called_strike|");
    expect(params.get("hfAB")).toBe("strikeout|single|home_run|");
    expect(params.get("hfBBT")).toBe("line_drive|fly_ball|");
  });
});

describe("searchQueryCacheKey", () => {
  it("collapses to the same key regardless of list-field order", () => {
    const a: SearchQuery = { pitchTypes: ["FF", "SL"], seasons: [2024, 2023] };
    const b: SearchQuery = { pitchTypes: ["SL", "FF"], seasons: [2023, 2024] };
    expect(searchQueryCacheKey(a)).toBe(searchQueryCacheKey(b));
  });

  it("differs when the filter set differs", () => {
    const a: SearchQuery = { pitchTypes: ["FF"] };
    const b: SearchQuery = { pitchTypes: ["FF", "SL"] };
    expect(searchQueryCacheKey(a)).not.toBe(searchQueryCacheKey(b));
  });

  it("strips empty arrays and undefined fields so they don't affect the key", () => {
    const a: SearchQuery = {
      pitchTypes: ["FF"],
      events: [],
      pitcherThrows: undefined,
    };
    const b: SearchQuery = { pitchTypes: ["FF"] };
    expect(searchQueryCacheKey(a)).toBe(searchQueryCacheKey(b));
  });
});

describe("searchPitches", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Minimal Savant-shaped CSV — header row + N data rows. Numeric
  // fields cast to numbers via castRow (release_pos_x etc.).
  const csvRow = (i: number) =>
    [
      i, // game_pk (just any unique value)
      "2024-04-01",
      "R",
      669373,
      592450,
      i,
      1,
      0,
      0,
      0,
      1,
      "Top",
      null,
      null,
      null,
      "FF",
      "4-Seam Fastball",
      "swinging_strike",
      "",
      1.4,
      54.7,
      6.2,
      -3.5,
      -141.6,
      -7.4,
      4.97,
      28.4,
      -16.1,
      0.05,
      3.18,
      97.2,
      2400,
      225,
      -0.81,
      1.49,
      6.3,
      97.0,
      0.05,
      0.02,
      "DET",
      "TB",
    ]
      .map((v) => (v === null ? "" : String(v)))
      .join(",");
  const csvHeader =
    "game_pk,game_date,game_type,pitcher,batter,at_bat_number,pitch_number,balls,strikes,outs_when_up,inning,inning_topbot,on_1b,on_2b,on_3b,pitch_type,pitch_name,description,events,release_pos_x,release_pos_y,release_pos_z,vx0,vy0,vz0,ax,ay,az,plate_x,plate_z,release_speed,release_spin_rate,spin_axis,pfx_x,pfx_z,release_extension,effective_speed,delta_run_exp,delta_home_win_exp,home_team,away_team";
  const buildCsv = (rowCount: number) =>
    [csvHeader, ...Array.from({ length: rowCount }, (_, i) => csvRow(i))].join(
      "\n",
    );

  it("returns parsed rows with numeric coercion when the response fits the cap", async () => {
    const csv = buildCsv(3);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => csv,
    } as Response);

    const result = await searchPitches({ pitchTypes: ["FF"] });

    expect(result.rows).toHaveLength(3);
    expect(result.truncated).toBe(false);
    expect(result.totalReturned).toBe(3);
    // Numeric coercion happened — release_pos_x is a number, not a string.
    expect(typeof result.rows[0].release_pos_x).toBe("number");
    expect(result.rows[0].pitch_type).toBe("FF");
  });

  it("flags truncation when Savant returned more rows than the limit", async () => {
    const csv = buildCsv(7);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => csv,
    } as Response);

    const result = await searchPitches({ pitchTypes: ["FF"], limit: 5 });

    expect(result.rows).toHaveLength(5);
    expect(result.truncated).toBe(true);
    expect(result.totalReturned).toBe(7);
  });

  it("uses MAX_RESULTS as the default cap", () => {
    expect(MAX_RESULTS).toBeGreaterThan(0);
  });

  it("throws on a non-OK Savant response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "",
    } as Response);

    await expect(searchPitches({ pitchTypes: ["FF"] })).rejects.toThrow(
      /503/,
    );
  });
});
