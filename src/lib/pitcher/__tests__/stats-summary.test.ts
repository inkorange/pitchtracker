import { describe, expect, it } from "vitest";
import { byPitchType, outcomeMix, seasonStrip, sideSplit, type SummaryPitch } from "../stats-summary";

const p = (o: Partial<SummaryPitch>): SummaryPitch => ({
  pitch_type: "FF", description: "ball", release_speed: 95, release_spin_rate: 2300, events: null, stand: "R", ...o,
});
const ps = [
  p({ description: "swinging_strike", release_speed: 97 }),
  p({ description: "called_strike" }),
  p({ description: "ball" }),
  p({ description: "hit_into_play", events: "single", stand: "L" }),
  p({ pitch_type: "SL", description: "swinging_strike", events: "strikeout", release_speed: 86, release_spin_rate: 2600 }),
];

describe("stats summary", () => {
  it("builds the per-type table", () => {
    const [ff, sl] = byPitchType(ps);
    expect(ff).toEqual({ type: "FF", n: 4, usage: 80, mph: 95.5, max: 97, spin: 2300, strikePct: 75, whiffs: 1, cswPct: 50 });
    expect(sl).toMatchObject({ type: "SL", n: 1, whiffs: 1, cswPct: 100 });
  });
  it("mixes outcomes in legend order", () => {
    expect(outcomeMix(ps).map((o) => [o.cat, o.n])).toEqual([["whiff", 2], ["called", 1], ["ball", 1], ["foul", 0], ["inplay", 1]]);
  });
  it("splits by batter side on terminating pitches", () => {
    const [l, r] = sideSplit(ps);
    expect(l).toMatchObject({ bf: 1, h: 1, k: 0 });
    expect(r).toMatchObject({ bf: 1, k: 1, pitches: 4, whiffPct: 50 });
  });
  it("summarizes the season strip", () => {
    expect(seasonStrip(ps)).toEqual({ pitches: 5, bf: 2, k: 1, bb: 0, h: 1, hr: 0, strikePct: 80, whiffPct: 40, cswPct: 60 });
  });
});
