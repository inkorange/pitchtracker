import { describe, expect, it } from "vitest";
import { pitcherPagePath, slugifyPitcherName } from "../pitcher-slug";

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
