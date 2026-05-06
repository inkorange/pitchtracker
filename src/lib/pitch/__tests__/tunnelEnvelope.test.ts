import { describe, expect, it } from "vitest";
import { buildTunnelEnvelope } from "../tunnelEnvelope";
import type { CachedPitchSubset } from "../averages";

// Same arm slot, ~95mph fastball.
const FF: CachedPitchSubset = {
  pitch_type: "FF",
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
};

// Same release point + similar vy0 / ay; different break.
const SL: CachedPitchSubset = {
  ...FF,
  pitch_type: "SL",
  vy0: -125,
  ax: -3,
  ay: 25,
  az: -32,
  plate_x: -1.2,
  plate_z: 1.5,
  release_speed: 88,
};

// Different release slot — drops 4" lower and 6" further toward 1B.
const FF_OFF_SLOT: CachedPitchSubset = {
  ...FF,
  release_pos_x: 2.0,
  release_pos_z: 5.66,
};

function jitter(p: CachedPitchSubset, seed: number): CachedPitchSubset {
  const r = (n: number) => ((Math.sin(seed * 12.9898 + n) * 43758.5453) % 1) * 0.04;
  return {
    ...p,
    release_pos_x: (p.release_pos_x ?? 0) + r(1),
    release_pos_z: (p.release_pos_z ?? 0) + r(2),
    vx0: (p.vx0 ?? 0) + r(3),
    vz0: (p.vz0 ?? 0) + r(4),
  };
}

function bunch(template: CachedPitchSubset, n: number): CachedPitchSubset[] {
  return Array.from({ length: n }, (_, i) => jitter(template, i));
}

describe("buildTunnelEnvelope", () => {
  it("returns null with fewer than two pitch types", () => {
    expect(buildTunnelEnvelope(bunch(FF, 5))).toBeNull();
  });

  it("FF + SL from same slot yields a long tunnel that ends before the plate", () => {
    const env = buildTunnelEnvelope([...bunch(FF, 8), ...bunch(SL, 8)]);
    expect(env).not.toBeNull();
    if (!env) return;
    expect(env.tunnelEndY).toBeGreaterThan(0); // ends before plate
    expect(env.tunnelEndY).toBeLessThan(env.releaseY);
    expect(env.stats.tunnelLengthFt).toBeGreaterThan(10);
    // Slot is shared so release spread should be tiny.
    expect(env.stats.releaseSpreadIn).toBeLessThan(1.5);
    // Pitches end up in different places.
    expect(env.stats.plateSpreadIn).toBeGreaterThan(6);
    expect(env.stats.plateToCommit).toBeGreaterThan(1);
    expect(env.stats.types).toEqual(["FF", "SL"]);
    expect(env.stats.n).toBe(16);
  });

  it("a sloppy release slot shows up as bigger releaseSpread, not shorter tunnel", () => {
    // Under spread-delta semantics, an offset release point is
    // baselined out — what matters for "tunnel length" is in-flight
    // divergence, which is the same in both cases here. The slot
    // sloppiness is reported separately via releaseSpreadIn.
    const tight = buildTunnelEnvelope([...bunch(FF, 6), ...bunch(SL, 6)]);
    const sloppy = buildTunnelEnvelope([...bunch(FF_OFF_SLOT, 6), ...bunch(SL, 6)]);
    expect(tight && sloppy).toBeTruthy();
    if (!tight || !sloppy) return;
    expect(sloppy.stats.releaseSpreadIn).toBeGreaterThan(tight.stats.releaseSpreadIn);
  });

  it("parallel paths with wide release still produce a meaningful tunnel", () => {
    // Two pitch types whose flight dynamics are IDENTICAL but whose
    // release points sit ~7 inches apart. Absolute-threshold logic
    // would call this "tunnel length 0" because spread > 1 baseball
    // at release. Spread-delta correctly recognizes the bundle never
    // grows beyond its baseline → tunnel reaches the plate.
    const SL_PARALLEL: typeof FF = {
      ...FF,
      pitch_type: "SL",
      release_pos_x: 2.1, // 0.6 ft to the side of FF
      release_pos_z: 5.6, // 0.4 ft below FF
    };
    const env = buildTunnelEnvelope([...bunch(FF, 8), ...bunch(SL_PARALLEL, 8)]);
    expect(env).not.toBeNull();
    if (!env) return;
    expect(env.stats.releaseSpreadIn).toBeGreaterThan(6); // wide baseline
    expect(env.stats.tunnelLengthFt).toBeGreaterThan(20); // still long tunnel
  });

  it("ignores pitch types that fall under the min-pitch-count filter", () => {
    // A stray "EP" eephus (n=2) shouldn't show up in the type list
    // even though the input technically has three labels.
    const EP: typeof FF = { ...FF, pitch_type: "EP", vy0: -90 };
    const env = buildTunnelEnvelope([
      ...bunch(FF, 6),
      ...bunch(SL, 6),
      ...bunch(EP, 2),
    ]);
    expect(env).not.toBeNull();
    if (!env) return;
    expect(env.stats.types).toEqual(["FF", "SL"]);
    expect(env.stats.n).toBe(12); // EP excluded from the count
  });

  it("a wider deviation threshold pushes the tunnel end closer to the plate", () => {
    const tight = buildTunnelEnvelope([...bunch(FF, 6), ...bunch(SL, 6)], {
      thresholdFt: 0.05,
    });
    const loose = buildTunnelEnvelope([...bunch(FF, 6), ...bunch(SL, 6)], {
      thresholdFt: 1.0,
    });
    expect(tight && loose).toBeTruthy();
    if (!tight || !loose) return;
    expect(loose.tunnelEndY).toBeLessThanOrEqual(tight.tunnelEndY);
  });

  it("does not collapse to length 0 when release_pos_y has natural stddev", () => {
    // Regression for an early bug: yStart was anchored to the *max*
    // release_pos_y across pitches, then samples skipped pitches
    // released later. At that y only outliers contributed and the
    // per-type means were biased enough to cross threshold instantly,
    // forcing tunnel length to 0. A pitcher with realistic release-y
    // jitter (0.15 ft stddev across many pitches) should still produce
    // a meaningful tunnel.
    const ffSet: CachedPitchSubset[] = Array.from({ length: 30 }, (_, i) => ({
      ...FF,
      release_pos_y: 53.7 + Math.sin(i * 1.7) * 0.15, // ±0.15 ft jitter
      release_pos_x: 1.5 + Math.cos(i * 1.7) * 0.04,
      release_pos_z: 6.0 + Math.sin(i * 0.9) * 0.08,
    }));
    const slSet: CachedPitchSubset[] = Array.from({ length: 30 }, (_, i) => ({
      ...SL,
      release_pos_y: 53.8 + Math.sin(i * 2.1) * 0.15,
      release_pos_x: 1.5 + Math.cos(i * 2.1) * 0.04,
      release_pos_z: 6.0 + Math.sin(i * 1.3) * 0.08,
    }));
    const env = buildTunnelEnvelope([...ffSet, ...slSet]);
    expect(env).not.toBeNull();
    if (!env) return;
    expect(env.stats.tunnelLengthFt).toBeGreaterThan(5);
    expect(env.tunnelEndY).toBeLessThan(env.releaseY);
  });

  it("spine has at least two points and matching radii", () => {
    const env = buildTunnelEnvelope([...bunch(FF, 5), ...bunch(SL, 5)]);
    expect(env).not.toBeNull();
    if (!env) return;
    expect(env.spine.length).toBeGreaterThanOrEqual(2);
    expect(env.radii.length).toBe(env.spine.length);
    // Spine y is monotonically decreasing (release toward plate).
    for (let i = 1; i < env.spine.length; i++) {
      expect(env.spine[i][1]).toBeLessThanOrEqual(env.spine[i - 1][1]);
    }
  });
});
