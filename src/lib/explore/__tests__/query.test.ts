import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  describeCounts,
  describeZones,
  gameTypeLabel,
  groupOn,
  lockedHand,
  querySentence,
  RESULT_GROUPS,
  toggleGroup,
  zoneFor,
  type ExploreFilters,
} from "../query";

const empty: ExploreFilters = {
  pid: [], bid: [], pth: null, bst: null, pt: [], s: [], df: null, dt: null,
  c: [], o: [], inn: [], gt: ["R"], d: [], ev: [], bb: [], z: [],
};
const names = { pitchers: (id: number) => `P${id}`, batters: (id: number) => `B${id}`, pitchLabel: (c: string) => c };

describe("group toggles", () => {
  const whiff = RESULT_GROUPS[0].codes;
  it("adds a whole group, then removes it", () => {
    const on = toggleGroup(["ball"], whiff);
    expect(groupOn(on, whiff)).toBe(true);
    expect(toggleGroup(on, whiff)).toEqual(["ball"]);
  });
  it("a partially selected group counts as off and toggles fully on", () => {
    expect(groupOn(["swinging_strike"], whiff)).toBe(false);
    expect(toggleGroup(["swinging_strike"], whiff).sort()).toEqual([...whiff].sort());
  });
});

describe("descriptions", () => {
  it("names presets, game types and zones", () => {
    expect(describeCounts(["0-2", "1-2", "2-2", "3-2"])).toBe("two-strike counts");
    expect(describeCounts(["0-0"])).toBe("the first pitch");
    expect(describeCounts(["1-0", "3-1"])).toBe("1-0, 3-1");
    expect(gameTypeLabel(["W", "L", "D", "F"])).toBe("Postseason (all)");
    expect(gameTypeLabel(["R", "S"])).toBe("Custom");
    expect(describeZones([11, 12, 13, 14])).toBe("chase zones");
    expect(describeZones([5, 1])).toBe("zones 1, 5");
  });

  it("builds the query sentence", () => {
    const parts = querySentence(
      { ...empty, pid: [1], bst: "L", pt: ["FF", "SI", "FC", "FA", "SL"], s: [2026], d: RESULT_GROUPS[0].codes, z: [11, 12, 13, 14] },
      names,
    );
    expect(parts.map((p) => `${p.pre} ${p.v}`).join(" ")).toBe(
      "by P1 · Fastballs & SL vs LHB in 2026 → Whiff in chase zones",
    );
  });

  it("defaults to 'anyone' and skips the default game type", () => {
    expect(querySentence(empty, names)).toEqual([{ pre: "by", v: "anyone" }]);
  });
});

describe("activeFilterCount", () => {
  it("counts set controls, ignoring the default game type", () => {
    expect(activeFilterCount(empty)).toBe(0);
    expect(activeFilterCount({ ...empty, pt: ["FF"], c: ["0-0"], gt: ["W"] })).toBe(3);
  });
});

describe("zoneFor", () => {
  it("maps plate locations to zone codes (catcher's view)", () => {
    expect(zoneFor(0, 2.5)).toBe(5);
    expect(zoneFor(-0.8, 3.4)).toBe(1);
    expect(zoneFor(0.8, 1.6)).toBe(9);
    expect(zoneFor(-1.5, 4)).toBe(11);
    expect(zoneFor(1.5, 1)).toBe(14);
    expect(zoneFor(null, 2)).toBeNull();
  });
});

describe("lockedHand", () => {
  const hand = (id: number) => ({ 1: "L", 2: "L", 3: "R", 4: "S" } as Record<number, string>)[id] ?? null;
  it("locks when every selected player shares one side", () => {
    expect(lockedHand([1], hand)).toBe("L");
    expect(lockedHand([1, 2], hand)).toBe("L");
  });
  it("stays open for mixed sides, switch hitters, unknowns, or nobody", () => {
    expect(lockedHand([1, 3], hand)).toBeNull();
    expect(lockedHand([4], hand)).toBeNull();
    expect(lockedHand([99], hand)).toBeNull();
    expect(lockedHand([], hand)).toBeNull();
  });
});
