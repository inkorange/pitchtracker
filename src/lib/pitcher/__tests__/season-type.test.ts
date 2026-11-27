import { describe, expect, it } from "vitest";
import { effectiveSeasonType, matchesSeasonType, parseSeasonType } from "../season-type";

describe("season type", () => {
  it("defaults to regular season", () => {
    expect(parseSeasonType(null)).toBe("reg");
    expect(parseSeasonType("junk")).toBe("reg");
    expect(parseSeasonType("post")).toBe("post");
  });
  it("a selected game overrides it", () => {
    expect(effectiveSeasonType("post", "849830")).toBe("all");
    expect(effectiveSeasonType("post", null)).toBe("post");
  });
  it("splits Statcast game types", () => {
    expect(matchesSeasonType("R", "reg")).toBe(true);
    expect(matchesSeasonType(null, "reg")).toBe(true);
    for (const t of ["F", "D", "L", "W"]) {
      expect(matchesSeasonType(t, "post")).toBe(true);
      expect(matchesSeasonType(t, "reg")).toBe(false);
    }
    expect(matchesSeasonType("R", "post")).toBe(false);
    expect(matchesSeasonType("W", "all")).toBe(true);
  });
});
