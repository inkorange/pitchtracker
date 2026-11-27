import { describe, expect, it } from "vitest";
import {
  eventLabel,
  eventTone,
  finalCount,
  groupPlateAppearances,
  summarize,
  type PitchInput,
} from "../plate-appearances";

const p = (over: Partial<PitchInput>): PitchInput => ({
  game_pk: 1,
  at_bat_number: 1,
  pitch_number: 1,
  pitch_type: "FF",
  batter_id: 10,
  description: "ball",
  events: null,
  inning: 1,
  inning_topbot: "Top",
  game_date: "2026-04-01",
  ...over,
});

describe("finalCount", () => {
  it("counts balls, strikes, and caps fouls at two strikes", () => {
    expect(finalCount(["ball", "called_strike", "foul", "foul", "foul", "ball"])).toBe("2-2");
    expect(finalCount(["ball", "ball", "ball", "called_strike", "swinging_strike"])).toBe("3-2");
  });
  it("caps a walk at 3 balls and a strikeout at 2 strikes in the display", () => {
    expect(finalCount(["ball", "ball", "ball", "ball"])).toBe("3-0");
    expect(finalCount(["called_strike", "called_strike", "swinging_strike"])).toBe("0-2");
  });
});

describe("groupPlateAppearances", () => {
  const rows = [
    p({ pitch_number: 2, description: "swinging_strike", events: "strikeout", pitch_type: "SL" }),
    p({ pitch_number: 1, description: "called_strike" }),
    p({ game_pk: 2, game_date: "2026-05-01", description: "hit_into_play", events: "single" }),
    p({ batter_id: null }),
  ];
  const pas = groupPlateAppearances(rows);

  it("groups by game + at-bat, orders pitches, newest PA first", () => {
    expect(pas.map((x) => [x.gamePk, x.sequence])).toEqual([
      [2, ["FF"]],
      [1, ["FF", "SL"]],
    ]);
    expect(pas[1]).toMatchObject({ event: "strikeout", count: "0-2", swingingStrikes: 1, half: "Top" });
  });

  it("summarizes PA / AB / H / K / BB / whiff% per pitch", () => {
    expect(summarize(pas)).toEqual({ pa: 2, ab: 2, h: 1, k: 1, bb: 0, pitches: 3, whiffPct: 33.3 });
  });

  it("excludes walks and sac flies from AB", () => {
    const s = summarize(
      groupPlateAppearances([
        p({ at_bat_number: 1, events: "walk" }),
        p({ at_bat_number: 2, events: "sac_fly", description: "hit_into_play" }),
        p({ at_bat_number: 3, events: "field_out", description: "hit_into_play" }),
      ]),
    );
    expect([s.pa, s.ab, s.bb]).toEqual([3, 1, 1]);
  });
});

describe("eventLabel / eventTone", () => {
  it("labels and colors outcomes", () => {
    expect(eventLabel("home_run")).toBe("Home run");
    expect(eventLabel("some_new_event")).toBe("Some new event");
    expect(eventTone("strikeout")).toBe("pitcher");
    expect(eventTone("double")).toBe("batter");
    expect(eventTone("sac_bunt")).toBe("neutral");
  });
});
