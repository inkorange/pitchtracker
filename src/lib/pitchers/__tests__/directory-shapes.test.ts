import { describe, expect, it } from "vitest";
import {
  buildPitchLines,
  filterAndSort,
  fromWire,
  toWire,
  findByPitch,
  roleFor,
  summarizeLines,
  type DirectoryRow,
} from "../directory-shapes";

const agg = (type: string, count: number, whiff: number | null, mph: number | null = 95) => ({
  pitch_type: type,
  pitch_count: count,
  usage_pct: 0,
  avg_velocity: mph,
  avg_spin_rate: 2400,
  avg_horizontal_break: 5,
  avg_induced_vertical_break: 15,
  whiff_rate: whiff,
});

const row = (over: Partial<DirectoryRow>): DirectoryRow => ({
  id: 1,
  name: "A",
  href: "/pitcher/1/a",
  teamId: 158,
  team: "MIL",
  hand: "R",
  role: "SP",
  strikeouts: 100,
  pitches: 1000,
  whiffPerSwing: 25,
  fbMph: 95,
  fbSpin: 2300,
  mix: [],
  ...over,
});

describe("summarizeLines", () => {
  it("weights per-swing whiff by pitch count and picks the four-seam as FB", () => {
    const lines = buildPitchLines([agg("SL", 100, 40, 86), agg("FF", 300, 20, 97)]);
    expect(lines.map((l) => l.type)).toEqual(["FF", "SL"]);
    expect(summarizeLines(lines)).toEqual({ pitches: 400, whiffPerSwing: 25, fbMph: 97, fbSpin: 2400 });
  });
  it("falls back to the sinker when there's no four-seam", () => {
    const s = summarizeLines(buildPitchLines([agg("SI", 200, 15, 93), agg("CH", 100, 35, 85)]));
    expect(s.fbMph).toBe(93);
  });
  it("returns null whiff when no type has a rate", () => {
    expect(summarizeLines(buildPitchLines([agg("FF", 10, null)])).whiffPerSwing).toBeNull();
  });
});

describe("roleFor", () => {
  it("classifies starters and relievers", () => {
    expect(roleFor(30, 31)).toBe("SP");
    expect(roleFor(0, 70)).toBe("RP");
    expect(roleFor(2, 2)).toBe("RP"); // spot/opener starts
    expect(roleFor(0, 0)).toBeNull();
  });
});

describe("filterAndSort", () => {
  const rows = [
    row({ id: 1, name: "José Álvarez", strikeouts: 50, hand: "L" }),
    row({ id: 2, name: "Bo B", strikeouts: 200 }),
    row({ id: 3, name: "Cy C", strikeouts: null }),
    row({ id: 4, name: "Di D", strikeouts: 120, pitches: 100 }),
  ];
  const base = { q: "", team: null, hand: null, role: null, minPitches: 500 } as const;

  it("sorts with nulls last in both directions and applies min pitches", () => {
    expect(filterAndSort(rows, base, "k", "desc").map((r) => r.id)).toEqual([2, 1, 3]);
    expect(filterAndSort(rows, base, "k", "asc").map((r) => r.id)).toEqual([1, 2, 3]);
  });
  it("matches names accent-insensitively and filters by hand", () => {
    expect(filterAndSort(rows, { ...base, q: "alvarez" }, "k", "desc").map((r) => r.id)).toEqual([1]);
    expect(filterAndSort(rows, { ...base, hand: "L" }, "k", "desc").map((r) => r.id)).toEqual([1]);
  });
});

describe("findByPitch", () => {
  const mk = (id: number, type: string, mph: number, whiff: number, count = 200) =>
    row({ id, mix: buildPitchLines([agg(type, count, whiff, mph)]) });

  it("filters by type (folding aliases) and min velocity, then ranks", () => {
    const rows = [mk(1, "FC", 92, 30), mk(2, "FC", 95, 20), mk(3, "SV", 84, 50), mk(4, "FC", 96, 40, 10)];
    expect(findByPitch(rows, "FC", 93, "whiff").map((f) => f.row.id)).toEqual([2]);
    expect(findByPitch(rows, "FC", 90, "whiff").map((f) => f.row.id)).toEqual([1, 2]);
    expect(findByPitch(rows, "ST", 80, "mph").map((f) => f.row.id)).toEqual([3]);
  });
});

describe("wire format", () => {
  it("round-trips a row", () => {
    const r = row({ mix: buildPitchLines([agg("FF", 300, 20, 97), agg("SL", 100, 40, 86)]) });
    expect(fromWire(toWire(r), () => r.href)).toEqual(r);
  });
  it("drops aggregate rows with no pitch type", () => {
    expect(buildPitchLines([agg("", 50, 10), agg("FF", 10, 10)]).map((l) => l.type)).toEqual(["FF"]);
  });
});
