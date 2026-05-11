import { describe, it, expect } from "vitest";
import { Pitch, type StatcastRow } from "../Pitch";

// Two Statcast rows hand-transcribed from real pitches (slight rounding ~2 sig figs).
// We test the math's internal consistency — given the release point, velocity,
// and acceleration, the integrated path must:
//   - start exactly at the release point
//   - end exactly at the plate (y=0) with positions consistent with the model
//   - produce realistic velocities and flight durations
// Once we have full-precision CSV-loaded fixtures we'll add a tighter end-to-end
// test against recorded plate_x / plate_z.

const SKUBAL_FASTBALL: StatcastRow = {
  release_pos_x: 1.36,
  release_pos_y: 54.7,
  release_pos_z: 6.21,
  vx0: -3.55,
  vy0: -141.6,
  vz0: -7.44,
  ax: 4.97,
  ay: 28.4,
  az: -16.1,
  plate_x: 0.05,
  plate_z: 3.18,
  release_speed: 97.2,
  pitch_type: "FF",
  pfx_x: -0.81,
  pfx_z: 1.49,
};

const COLE_SLIDER: StatcastRow = {
  release_pos_x: -2.05,
  release_pos_y: 54.4,
  release_pos_z: 5.95,
  vx0: 6.7,
  vy0: -127.2,
  vz0: -4.6,
  ax: -3.6,
  ay: 25.1,
  az: -32.5,
  plate_x: 0.4,
  plate_z: 2.05,
  release_speed: 87.6,
  pitch_type: "SL",
  pfx_x: 0.32,
  pfx_z: 0.18,
};

describe("Pitch trajectory reconstruction", () => {
  it("path starts at the recorded release point (Skubal fastball)", () => {
    const pitch = new Pitch(SKUBAL_FASTBALL);
    const [x, y, z] = pitch.path(50)[0];
    expect(Math.abs(x - SKUBAL_FASTBALL.release_pos_x)).toBeLessThan(0.05);
    expect(Math.abs(y - SKUBAL_FASTBALL.release_pos_y)).toBeLessThan(0.05);
    expect(Math.abs(z - SKUBAL_FASTBALL.release_pos_z)).toBeLessThan(0.05);
  });

  it("path starts at the recorded release point (Cole slider)", () => {
    const pitch = new Pitch(COLE_SLIDER);
    const [x, y, z] = pitch.path(50)[0];
    expect(Math.abs(x - COLE_SLIDER.release_pos_x)).toBeLessThan(0.05);
    expect(Math.abs(y - COLE_SLIDER.release_pos_y)).toBeLessThan(0.05);
    expect(Math.abs(z - COLE_SLIDER.release_pos_z)).toBeLessThan(0.05);
  });

  it("path ends exactly at the plate (y=0) with the model-consistent plate_x and plate_z", () => {
    const pitch = new Pitch(SKUBAL_FASTBALL);
    const path = pitch.path(200);
    const last = path[path.length - 1];
    expect(last[1]).toBeCloseTo(0, 4);
    // The integrated plate location should match a direct evaluation of positionAtTime
    // at the same t — trivially true if the math is internally consistent.
    const tEnd = pitch.flightDuration() + pitch["_solveTimeAtY"](SKUBAL_FASTBALL.release_pos_y);
    const direct = pitch.positionAtTime(tEnd);
    expect(Math.abs(last[0] - direct[0])).toBeLessThan(1e-9);
    expect(Math.abs(last[2] - direct[2])).toBeLessThan(1e-9);
  });

  it("reports release-point velocity within 1 mph of release_speed", () => {
    const pitch = new Pitch(SKUBAL_FASTBALL);
    const v = pitch.velocityAt(SKUBAL_FASTBALL.release_pos_y);
    expect(Math.abs(v - SKUBAL_FASTBALL.release_speed)).toBeLessThan(1.0);
  });

  it("flight duration is in the realistic 0.35–0.5s range for an MLB pitch", () => {
    const pitch = new Pitch(SKUBAL_FASTBALL);
    const dt = pitch.flightDuration();
    expect(dt).toBeGreaterThan(0.35);
    expect(dt).toBeLessThan(0.5);
  });

  it("break-onset distance is between the plate and the release point", () => {
    const pitch = new Pitch(SKUBAL_FASTBALL);
    const onset = pitch.breakOnsetDistance(0.5);
    // Half-break time is 1/sqrt(2) ≈ 70.7% of total flight from release.
    // Because of drag the ball decelerates, so at 70.7% of time it has
    // already covered well over 70.7% of its distance — meaning the y
    // position is closer to the plate than the path midpoint (~27 ft).
    expect(onset).toBeGreaterThan(0);
    expect(onset).toBeLessThan(SKUBAL_FASTBALL.release_pos_y);
    expect(onset).toBeLessThan(27);
  });

  it("break-onset threshold ordering: 0.25 occurs farther out than 0.75", () => {
    const pitch = new Pitch(SKUBAL_FASTBALL);
    const early = pitch.breakOnsetDistance(0.25);
    const late = pitch.breakOnsetDistance(0.75);
    // Lower threshold = earlier in flight = farther from plate (larger y).
    expect(early).toBeGreaterThan(late);
  });

  it("velocity decays from release to plate (atmospheric drag)", () => {
    const pitch = new Pitch(SKUBAL_FASTBALL);
    const vRelease = pitch.velocityAt(SKUBAL_FASTBALL.release_pos_y);
    const vPlate = pitch.velocityAt(0);
    expect(vPlate).toBeLessThan(vRelease);
    expect(vRelease - vPlate).toBeGreaterThan(5);
    expect(vRelease - vPlate).toBeLessThan(15);
  });
});
