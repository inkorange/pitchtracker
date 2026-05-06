import { describe, expect, it } from "vitest";
import { Pitch, type StatcastRow } from "../Pitch";
import { computeTunnelStats, sampleDistance } from "../tunneling";

// Two pitches from the same pitcher (same release point, same vy0/ay
// shape) but different ax/az — modeling a fastball-vs-slider tunnel.
const FASTBALL: StatcastRow = {
  release_pos_x: 1.5,
  release_pos_y: 54.5,
  release_pos_z: 6.0,
  vx0: -3.5,
  vy0: -135,
  vz0: -7,
  ax: 5,
  ay: 28,
  az: -16,
  plate_x: 0,
  plate_z: 3.0,
  release_speed: 95,
  pitch_type: "FF",
};

// Same release point + similar y dynamics but different lateral/vertical
// acceleration → ball ends up in a different plate location.
const SLIDER: StatcastRow = {
  release_pos_x: 1.5,
  release_pos_y: 54.5,
  release_pos_z: 6.0,
  vx0: -3.5,
  vy0: -125,
  vz0: -7,
  ax: -3,
  ay: 25,
  az: -32,
  plate_x: -1.2,
  plate_z: 1.5,
  release_speed: 88,
  pitch_type: "SL",
};

describe("computeTunnelStats", () => {
  it("two identical pitches tunnel all the way to the plate", () => {
    const a = new Pitch(FASTBALL);
    const b = new Pitch(FASTBALL);
    const stats = computeTunnelStats(a, b);
    expect(stats.tunnelY).not.toBeNull();
    expect(stats.tunnelY).toBeLessThanOrEqual(0.5); // tunnels to the plate
    expect(stats.commitDistance).toBeLessThan(0.001);
    expect(stats.plateDistance).toBeLessThan(0.001);
  });

  it("a fastball and a slider from the same arm tunnel for some distance then diverge", () => {
    const a = new Pitch(FASTBALL);
    const b = new Pitch(SLIDER);
    const stats = computeTunnelStats(a, b);
    // Same release point ⇒ they must tunnel close to release at minimum.
    expect(stats.tunnelY).not.toBeNull();
    expect(stats.tunnelY!).toBeGreaterThan(35); // still close out of the hand
    // Plate should show clear divergence.
    expect(stats.plateDistance).toBeGreaterThan(0.5);
    expect(stats.plateDistance).toBeGreaterThan(stats.commitDistance);
    expect(stats.qualityScore).toBeGreaterThan(1);
  });

  it("threshold scaling — a wider threshold finds a later tunnel y", () => {
    const a = new Pitch(FASTBALL);
    const b = new Pitch(SLIDER);
    const tight = computeTunnelStats(a, b, { thresholdFt: 0.05 });
    const loose = computeTunnelStats(a, b, { thresholdFt: 0.5 });
    expect(loose.tunnelY!).toBeLessThan(tight.tunnelY!);
  });
});

describe("sampleDistance", () => {
  it("returns a monotonically-increasing distance for diverging pitches", () => {
    const a = new Pitch(FASTBALL);
    const b = new Pitch(SLIDER);
    const samples = sampleDistance(a, b);
    expect(samples.length).toBeGreaterThan(50);
    // Distance at start (release) should be ~0; distance at plate should be > 0.
    expect(samples[0].distance).toBeLessThan(0.01);
    expect(samples[samples.length - 1].distance).toBeGreaterThan(0.5);
  });
});
