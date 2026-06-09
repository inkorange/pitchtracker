import { describe, expect, it } from "vitest";
import {
  atBatPath,
  atBatSlug,
  pitcherPagePath,
  slugifyPitcherName,
} from "../pitcher-slug";

describe("slugifyPitcherName", () => {
  it("lower-cases and hyphenates a vanilla name", () => {
    expect(slugifyPitcherName("Paul Skenes")).toBe("paul-skenes");
  });

  it("strips diacritics (Andrés → andres)", () => {
    expect(slugifyPitcherName("Andrés Muñoz")).toBe("andres-munoz");
    expect(slugifyPitcherName("Sandy Alcántara")).toBe("sandy-alcantara");
  });

  it("strips periods and apostrophes (J.T. Realmuto → jt-realmuto)", () => {
    expect(slugifyPitcherName("J.T. Realmuto")).toBe("jt-realmuto");
    expect(slugifyPitcherName("Ke'Bryan Hayes")).toBe("kebryan-hayes");
  });

  it("collapses runs of whitespace and hyphens", () => {
    expect(slugifyPitcherName("Cal  Quantrill")).toBe("cal-quantrill");
    expect(slugifyPitcherName("Jose --  Berrios")).toBe("jose-berrios");
  });

  it("preserves existing hyphens within names", () => {
    expect(slugifyPitcherName("Hyun Jin Ryu")).toBe("hyun-jin-ryu");
    expect(slugifyPitcherName("Jose Suarez-Roman")).toBe("jose-suarez-roman");
  });

  it("falls back to 'player' on empty or punctuation-only input", () => {
    expect(slugifyPitcherName("")).toBe("player");
    expect(slugifyPitcherName(".  .")).toBe("player");
  });

  it("pitcherPagePath composes the full URL path", () => {
    expect(pitcherPagePath(694973, "Paul Skenes")).toBe(
      "/pitcher/694973/paul-skenes",
    );
  });
});

describe("atBatSlug + atBatPath", () => {
  it("joins pitcher and batter with '-vs-' when both are present", () => {
    expect(atBatSlug("Paul Skenes", "Francisco Lindor")).toBe(
      "paul-skenes-vs-francisco-lindor",
    );
  });

  it("falls back to pitcher-only when batter is null", () => {
    expect(atBatSlug("Paul Skenes", null)).toBe("paul-skenes");
  });

  it("applies diacritic + punctuation rules to both names", () => {
    expect(atBatSlug("Andrés Muñoz", "J.T. Realmuto")).toBe(
      "andres-munoz-vs-jt-realmuto",
    );
  });

  it("atBatPath composes the full URL path with both names", () => {
    expect(atBatPath(823130, 8, "Paul Skenes", "Francisco Lindor")).toBe(
      "/at-bat/823130/8/paul-skenes-vs-francisco-lindor",
    );
  });

  it("atBatPath falls back to pitcher-only segment when batter is null", () => {
    expect(atBatPath(823130, 8, "Paul Skenes", null)).toBe(
      "/at-bat/823130/8/paul-skenes",
    );
  });
});
