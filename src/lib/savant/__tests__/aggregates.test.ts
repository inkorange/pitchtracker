import { describe, it, expect } from "vitest";
import { computeAggregates } from "../aggregates";
import type { SavantPitchRow } from "../client";

// Minimal SavantPitchRow factory — only the fields aggregates touches.
// Cast through unknown so we don't have to populate the 30+ trajectory
// fields and so we can pass `null` for runtime-nullable fields that
// the StatcastRow type still describes as `field?: number`.
function row(partial: Record<string, unknown>): SavantPitchRow {
  return partial as unknown as SavantPitchRow;
}

describe("computeAggregates", () => {
  it("returns a zero-shaped result for an empty input", () => {
    const agg = computeAggregates([]);
    expect(agg.totalPitches).toBe(0);
    expect(agg.avgVelocity).toBeNull();
    expect(agg.peakVelocity).toBeNull();
    expect(agg.whiffRate).toBeNull();
    expect(agg.inZoneRate).toBeNull();
    expect(agg.pitchTypes).toEqual([]);
  });

  it("averages velocity / break / spin only over pitches that reported the value", () => {
    const rows = [
      row({ release_speed: 95, pfx_x: 0.5, pfx_z: 1.0, release_spin_rate: 2400 }),
      row({ release_speed: 97, pfx_x: -0.5, pfx_z: 1.5, release_spin_rate: null }),
      row({ release_speed: null, pfx_x: null, pfx_z: null, release_spin_rate: 2000 }),
    ];
    const agg = computeAggregates(rows);

    expect(agg.totalPitches).toBe(3);
    expect(agg.avgVelocity).toBeCloseTo(96, 5); // (95 + 97) / 2
    expect(agg.peakVelocity).toBe(97);
    // (0.5 + -0.5) / 2 * 12 = 0
    expect(agg.avgHorizontalBreak).toBeCloseTo(0, 5);
    // (1.0 + 1.5) / 2 * 12 = 15
    expect(agg.avgInducedVerticalBreak).toBeCloseTo(15, 5);
    // (2400 + 2000) / 2 = 2200 — third row's null spin is excluded.
    expect(agg.avgSpinRate).toBe(2200);
  });

  it("computes whiff rate as whiffs / swings, ignoring takes", () => {
    const rows = [
      // Takes — neither swung nor whiffed.
      row({ description: "ball" }),
      row({ description: "called_strike" }),
      // Swings.
      row({ description: "swinging_strike" }), // whiff
      row({ description: "swinging_strike_blocked" }), // whiff
      row({ description: "foul" }), // swing (not whiff)
      row({ description: "hit_into_play" }), // swing
    ];
    const agg = computeAggregates(rows);
    // 2 whiffs / 4 swings = 0.5
    expect(agg.whiffRate).toBeCloseTo(0.5, 5);
  });

  it("returns null whiff rate when there were no swings", () => {
    const rows = [row({ description: "ball" }), row({ description: "called_strike" })];
    expect(computeAggregates(rows).whiffRate).toBeNull();
  });

  it("computes inZoneRate using ±0.83 / 1.5–3.5 strike-zone bounds", () => {
    const rows = [
      // In zone (center).
      row({ plate_x: 0, plate_z: 2.5 }),
      // On edge — counted as in zone.
      row({ plate_x: 0.83, plate_z: 1.5 }),
      // Out of zone (high).
      row({ plate_x: 0, plate_z: 3.6 }),
      // Out of zone (wide).
      row({ plate_x: 1.0, plate_z: 2.5 }),
      // Missing data — excluded from the rate denominator.
      row({ plate_x: null, plate_z: null }),
    ];
    const agg = computeAggregates(rows);
    // 2 in-zone of 4 sampled; the missing-data pitch doesn't shift it.
    expect(agg.inZoneRate).toBeCloseTo(0.5, 5);
  });

  it("groups by pitch type with count / share / avgVelocity, sorted desc by count", () => {
    const rows = [
      row({ pitch_type: "FF", pitch_name: "4-Seam", release_speed: 96 }),
      row({ pitch_type: "FF", pitch_name: "4-Seam", release_speed: 98 }),
      row({ pitch_type: "FF", pitch_name: "4-Seam", release_speed: 97 }),
      row({ pitch_type: "SL", pitch_name: "Slider", release_speed: 88 }),
      row({ pitch_type: "SL", pitch_name: "Slider", release_speed: 86 }),
      row({ pitch_type: "CH", pitch_name: "Changeup", release_speed: 84 }),
    ];
    const agg = computeAggregates(rows);
    expect(agg.pitchTypes.map((p) => p.pitchType)).toEqual(["FF", "SL", "CH"]);

    const ff = agg.pitchTypes[0];
    expect(ff.count).toBe(3);
    expect(ff.share).toBeCloseTo(0.5, 5);
    expect(ff.avgVelocity).toBeCloseTo(97, 5);
    expect(ff.pitchName).toBe("4-Seam");
  });

  it("falls back to 'UN' for rows with a null pitch_type", () => {
    const rows = [
      row({ pitch_type: null }),
      row({ pitch_type: null }),
      row({ pitch_type: "FF" }),
    ];
    const agg = computeAggregates(rows);
    const un = agg.pitchTypes.find((p) => p.pitchType === "UN");
    expect(un?.count).toBe(2);
  });
});
