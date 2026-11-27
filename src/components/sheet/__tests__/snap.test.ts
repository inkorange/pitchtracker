import { describe, expect, it } from "vitest";
import { clampVisible, settleSnap } from "../snap";

const SNAPS = [248, 460, 690];

describe("settleSnap", () => {
  it("settles on the nearest snap after a slow drag", () => {
    expect(settleSnap(300, 0, SNAPS, 0)).toBe(0);
    expect(settleSnap(400, 0, SNAPS, 0)).toBe(1);
    expect(settleSnap(650, 0.1, SNAPS, 1)).toBe(2);
  });
  it("a flick moves one step in its direction", () => {
    expect(settleSnap(260, 1.2, SNAPS, 0)).toBe(1);
    expect(settleSnap(660, -1.2, SNAPS, 2)).toBe(1);
    expect(settleSnap(690, 2, SNAPS, 2)).toBe(2);
  });
});

describe("clampVisible", () => {
  it("passes through inside the range and rubber-bands outside it", () => {
    expect(clampVisible(400, SNAPS)).toBe(400);
    expect(clampVisible(148, SNAPS)).toBe(218);
    expect(clampVisible(790, SNAPS)).toBe(720);
  });
});
