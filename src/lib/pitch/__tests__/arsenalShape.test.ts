import { describe, expect, it } from "vitest";
import { buildArsenalShape, type ShapePitch } from "../arsenalShape";

// Synthesizes a pitch with the fields buildArsenalShape touches.
// vy0/vz0/az defaults represent a generic ~95-mph fastball so the
// VAA computation produces a sensible negative number; tests that
// care about VAA override them.
function p(
  pitch_type: string,
  overrides: Partial<ShapePitch> = {},
): ShapePitch {
  return {
    pitch_type,
    release_pos_x: null,
    release_pos_z: null,
    plate_x: null,
    plate_z: null,
    vy0: -135,
    vz0: -5,
    az: -16,
    ...overrides,
  };
}

describe("buildArsenalShape", () => {
  it("groups by pitch type and reports counts sorted desc", () => {
    const pitches: ShapePitch[] = [
      p("FF"),
      p("FF"),
      p("FF"),
      p("SL"),
      p("CH"),
      p("CH"),
    ];
    const shape = buildArsenalShape(pitches, "R");
    expect(shape.pitch_types.map((r) => r.pitch_type)).toEqual([
      "FF",
      "CH",
      "SL",
    ]);
    expect(shape.pitch_types.map((r) => r.count)).toEqual([3, 2, 1]);
    expect(shape.pitcher_throws).toBe("R");
  });

  it("averages release point and reports spread", () => {
    const pitches: ShapePitch[] = [
      p("FF", { release_pos_x: 2.0, release_pos_z: 5.5 }),
      p("FF", { release_pos_x: 2.4, release_pos_z: 5.7 }),
      p("FF", { release_pos_x: 2.2, release_pos_z: 5.6 }),
    ];
    const shape = buildArsenalShape(pitches, "R");
    const ff = shape.pitch_types[0];
    expect(ff.release_x_avg).toBeCloseTo(2.2, 3);
    expect(ff.release_z_avg).toBeCloseTo(5.6, 3);
    // Population stddev of [2.0, 2.4, 2.2] = sqrt(0.02666...) ≈ 0.1633.
    expect(ff.release_x_spread).toBeCloseTo(0.1633, 3);
  });

  it("counts in-zone pitches against the rule-book strike zone", () => {
    const pitches: ShapePitch[] = [
      p("FF", { plate_x: 0, plate_z: 2.5 }), // dead center, in zone
      p("FF", { plate_x: 0.5, plate_z: 3.0 }), // inside zone
      p("FF", { plate_x: 1.5, plate_z: 2.5 }), // way outside (x)
      p("FF", { plate_x: 0, plate_z: 0.5 }), // way low (z)
    ];
    const shape = buildArsenalShape(pitches, "R");
    const ff = shape.pitch_types[0];
    expect(ff.in_zone_pct).toBeCloseTo(50, 5);
    expect(ff.plate_x_avg).toBeCloseTo(0.5, 5);
  });

  it("computes VAA per pitch type and skips rows with null kinematics", () => {
    // Approach angle stays consistent for repeated pitches with the
    // same (vy0, vz0, az), so the per-type avg should equal the
    // single-pitch value.
    const pitches: ShapePitch[] = [
      p("FF", { vy0: -135, vz0: -5, az: -16 }),
      p("FF", { vy0: -135, vz0: -5, az: -16 }),
      p("CU", { vy0: null }), // kinematics missing → contributes count, skipped from VAA
    ];
    const shape = buildArsenalShape(pitches, "R");
    const ff = shape.pitch_types.find((r) => r.pitch_type === "FF")!;
    const cu = shape.pitch_types.find((r) => r.pitch_type === "CU")!;
    expect(ff.vaa_avg).not.toBeNull();
    expect(ff.vaa_avg!).toBeLessThan(0); // descending
    expect(cu.vaa_avg).toBeNull();
    expect(cu.count).toBe(1);
  });

  it("returns nulls when a pitch type has no usable inputs for a field", () => {
    const shape = buildArsenalShape(
      [p("SL", { vy0: null, vz0: null, az: null })],
      "L",
    );
    const sl = shape.pitch_types[0];
    expect(sl.release_x_avg).toBeNull();
    expect(sl.release_x_spread).toBeNull();
    expect(sl.vaa_avg).toBeNull();
    expect(sl.plate_x_avg).toBeNull();
    expect(sl.in_zone_pct).toBe(0);
  });
});
