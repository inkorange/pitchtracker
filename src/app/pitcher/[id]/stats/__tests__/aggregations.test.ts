import { describe, expect, it } from "vitest";
import { aggregate, type StatPitch } from "../aggregations";

// Minimal StatPitch factory — only the fields the run-value math
// reads. Other fields default to null so the existing aggregations
// stay valid; this also exercises the null-safety guarantees.
function pitch(overrides: Partial<StatPitch>): StatPitch {
  return {
    pitch_type: "FF",
    description: null,
    release_speed: null,
    release_pos_x: null,
    release_pos_z: null,
    plate_x: null,
    plate_z: null,
    pfx_x: null,
    pfx_z: null,
    spin_axis: null,
    release_spin_rate: null,
    vy0: null,
    vz0: null,
    az: null,
    delta_run_exp: null,
    ...overrides,
  };
}

describe("aggregate – run value", () => {
  it("sums -delta_run_exp into rv_sum (pitcher frame: positive = saves)", () => {
    // Two FF pitches: one saved 0.1 runs (delta_run_exp = -0.1), one
    // gave up 0.05 runs (delta_run_exp = +0.05). Pitcher-frame net:
    // +0.05 runs saved.
    const rows = [
      pitch({ pitch_type: "FF", delta_run_exp: -0.1 }),
      pitch({ pitch_type: "FF", delta_run_exp: 0.05 }),
    ];
    const { perPitch } = aggregate(rows);
    expect(perPitch).toHaveLength(1);
    expect(perPitch[0].pitch_type).toBe("FF");
    expect(perPitch[0].rv_sum).toBeCloseTo(0.05, 5);
    expect(perPitch[0].rv_n).toBe(2);
  });

  it("skips null delta_run_exp from both numerator and denominator", () => {
    const rows = [
      pitch({ pitch_type: "FF", delta_run_exp: -0.2 }),
      pitch({ pitch_type: "FF", delta_run_exp: null }),
      pitch({ pitch_type: "FF", delta_run_exp: 0.1 }),
    ];
    const { perPitch } = aggregate(rows);
    expect(perPitch[0].rv_sum).toBeCloseTo(0.1, 5);
    expect(perPitch[0].rv_n).toBe(2);
    expect(perPitch[0].pitches).toBe(3); // pitch count unaffected
  });

  it("computes rv_per_100 using rv_n (not pitches) as the denominator", () => {
    // 50 pitches with delta_run_exp -0.1 (saves 5 total). 50 more with
    // null delta_run_exp. rv_n=50, rv_sum=5.0, /100 = 5.0/50 * 100 = 10.0.
    const rows = [
      ...Array.from({ length: 50 }, () =>
        pitch({ pitch_type: "FF", delta_run_exp: -0.1 }),
      ),
      ...Array.from({ length: 50 }, () =>
        pitch({ pitch_type: "FF", delta_run_exp: null }),
      ),
    ];
    const { perPitch } = aggregate(rows);
    expect(perPitch[0].rv_n).toBe(50);
    expect(perPitch[0].rv_sum).toBeCloseTo(5.0, 5);
    expect(perPitch[0].rv_per_100).toBeCloseTo(10.0, 5);
  });

  it("suppresses rv_per_100 when rv_n < 10 (sparse-data noise floor)", () => {
    const rows = Array.from({ length: 9 }, () =>
      pitch({ pitch_type: "SL", delta_run_exp: -0.05 }),
    );
    const { perPitch } = aggregate(rows);
    expect(perPitch[0].rv_n).toBe(9);
    expect(perPitch[0].rv_sum).toBeCloseTo(0.45, 5); // total still shown
    expect(perPitch[0].rv_per_100).toBeNull();
  });

  it("shows rv_per_100 at exactly rv_n = 10 (boundary is inclusive)", () => {
    const rows = Array.from({ length: 10 }, () =>
      pitch({ pitch_type: "CH", delta_run_exp: -0.05 }),
    );
    const { perPitch } = aggregate(rows);
    expect(perPitch[0].rv_n).toBe(10);
    expect(perPitch[0].rv_per_100).toBeCloseTo(5.0, 5);
  });

  it("yields rv_n=0 and rv_sum=null when every delta_run_exp is null", () => {
    const rows = [
      pitch({ pitch_type: "FF", delta_run_exp: null }),
      pitch({ pitch_type: "FF", delta_run_exp: null }),
    ];
    const { perPitch } = aggregate(rows);
    expect(perPitch[0].rv_n).toBe(0);
    expect(perPitch[0].rv_sum).toBeNull();
    expect(perPitch[0].rv_per_100).toBeNull();
  });

  it("returns empty perPitch when input is empty", () => {
    const { perPitch } = aggregate([]);
    expect(perPitch).toEqual([]);
  });

  it("buckets distinct pitch types separately with correct per-bucket rv math", () => {
    // 1 FF that saved 0.1 runs, 1 SL that gave up 0.2 runs.
    // Each should land in its own bucket with the correct
    // pitcher-frame sign.
    const rows = [
      pitch({ pitch_type: "FF", delta_run_exp: -0.1 }),
      pitch({ pitch_type: "SL", delta_run_exp: 0.2 }),
    ];
    const { perPitch } = aggregate(rows);
    expect(perPitch).toHaveLength(2);
    const byType = new Map(perPitch.map((p) => [p.pitch_type, p]));
    expect(byType.get("FF")?.rv_sum).toBeCloseTo(0.1, 5);
    expect(byType.get("FF")?.rv_n).toBe(1);
    expect(byType.get("SL")?.rv_sum).toBeCloseTo(-0.2, 5);
    expect(byType.get("SL")?.rv_n).toBe(1);
  });
});
