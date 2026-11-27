import { describe, expect, it } from "vitest";
import { seasonLine, type LinePitch } from "../season-line";

const p = (o: Partial<LinePitch>): LinePitch => ({ description: "ball", events: null, pitch_type: "FF", release_speed: 95, ...o });

describe("seasonLine", () => {
  it("uses the homepage definitions on regular-season pitches", () => {
    const line = seasonLine([
      p({ description: "swinging_strike", events: "strikeout" }),
      p({ description: "called_strike" }),
      p({ description: "foul_tip" }), // not a whiff by this definition
      p({ description: "ball", pitch_type: "SL", release_speed: 85 }),
      p({ description: "swinging_strike", game_type: "W" }), // postseason excluded
    ]);
    expect(line).toEqual({ pitches: 4, strikeouts: 1, whiffPct: 25, cswPct: 50, fbMph: 95 });
  });
  it("falls back to the sinker for FB mph, and handles no pitches", () => {
    expect(seasonLine([p({ pitch_type: "SI", release_speed: 93.24 })]).fbMph).toBe(93.2);
    expect(seasonLine([])).toEqual({ pitches: 0, strikeouts: 0, whiffPct: null, cswPct: null, fbMph: null });
  });
});
