import { describe, expect, it } from "vitest";
import { atBatResult, countsAfter, pitchResult, pitchResultShort, shortPitchName, zonePoint, ZONE } from "../labels";

const p = (balls: number, strikes: number, description: string, events: string | null = null) => ({
  pitch_type: "FF",
  description,
  events,
  balls,
  strikes,
  plate_x: 0,
  plate_z: 2.5,
});

describe("at-bat labels", () => {
  it("counts after each pitch, ending with the PA result", () => {
    const seq = [p(0, 0, "called_strike"), p(0, 1, "ball"), p(1, 1, "foul"), p(1, 2, "swinging_strike", "strikeout")];
    expect(countsAfter(seq)).toEqual(["0-1", "1-1", "1-2", "K"]);
    expect(countsAfter([p(0, 0, "hit_into_play", "single")])).toEqual(["1B"]);
    expect(countsAfter([p(0, 0, "hit_into_play", "field_out")])).toEqual(["Out"]);
  });
  it("names the result", () => {
    expect(atBatResult([p(1, 2, "swinging_strike", "strikeout")])).toBe("Strikeout swinging");
    expect(atBatResult([p(1, 2, "called_strike", "strikeout")])).toBe("Strikeout looking");
    expect(atBatResult([p(0, 0, "ball")])).toBeNull();
  });
  it("labels pitches", () => {
    expect(pitchResult("swinging_strike_blocked")).toBe("Swinging strike");
    expect(pitchResultShort("called_strike")).toBe("Called");
    expect(shortPitchName("FF")).toBe("4-Seam");
    expect(shortPitchName("CU")).toBe("Curve");
  });
  it("maps the middle of the zone to the middle of the inset", () => {
    const m = zonePoint(0, 2.5)!;
    expect(m.x).toBeCloseTo((ZONE.left + ZONE.right) / 2);
    expect(m.y).toBeCloseTo((ZONE.top + ZONE.bottom) / 2);
    expect(zonePoint(null, 2)).toBeNull();
  });
});
