import { describe, expect, it } from "vitest";
import { buildArsenal, evenSample, type SlimPitch } from "../feature-shapes";
import { buildTunnelDiagram, TUNNEL_VIEW } from "../tunnel";

// A plausible 95 mph four-seamer / 85 mph slider (Statcast units).
const ff: SlimPitch = [-1.8, 54, 6, 6, -138, -6, -12, 30, -14, 0.1, 2.8, 95, "FF"];
const sl: SlimPitch = [-1.8, 54, 6, 3, -124, -3, 5, 25, -28, 0.6, 1.9, 85, "SL"];

describe("evenSample", () => {
  it("returns the input when under the cap", () => {
    expect(evenSample([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });
  it("samples evenly across the whole range", () => {
    const out = evenSample(Array.from({ length: 100 }, (_, i) => i), 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toBe(0);
    expect(out[9]).toBe(90);
  });
});

describe("buildArsenal", () => {
  it("computes usage shares and labels", () => {
    const bars = buildArsenal([
      { pitch_type: "FF", pitch_count: 75, avg_velocity: 98.04 },
      { pitch_type: "SL", pitch_count: 25, avg_velocity: null },
    ]);
    expect(bars.map((b) => [b.label, b.pct, b.mph])).toEqual([
      ["Four-Seam", 75, "98.0"],
      ["Slider", 25, "—"],
    ]);
  });
  it("returns nothing for an empty arsenal", () => {
    expect(buildArsenal([])).toEqual([]);
  });
});

describe("buildTunnelDiagram", () => {
  it("draws one line per pitch type, most-used first, inside the view box", () => {
    const d = buildTunnelDiagram([ff, ff, ff, sl], 3);
    expect(d?.lines.map((l) => l.pitchType)).toEqual(["FF", "SL"]);
    const nums = d!.lines.flatMap((l) => l.d.match(/-?\d+(\.\d+)?/g)!.map(Number));
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...nums)).toBeLessThanOrEqual(TUNNEL_VIEW.w);
  });
  it("places the decision point between release and plate", () => {
    const d = buildTunnelDiagram([ff])!;
    expect(d.decisionX).toBeGreaterThan(d.release.x);
    expect(d.decisionX).toBeLessThan(d.plate.x);
  });
  it("returns null with no pitches", () => {
    expect(buildTunnelDiagram([])).toBeNull();
  });
});
