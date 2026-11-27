import { describe, expect, it } from "vitest";
import { splitSavantName, topFromArsenalCsv } from "../history-shapes";

const CSV = `﻿"last_name, first_name","pitcher","ff_avg_speed","si_avg_speed"
"Webb, Logan","657277","92.8","92.6"
"Miller, Mason","695243","101.4",
"Ramírez, Yennier","111","",
"Crochet, Garrett","676979","96.4","96"`;

describe("past-season leaderboard parsing", () => {
  it("splits Savant names", () => {
    expect(splitSavantName("Crow-Armstrong, Pete")).toEqual({ fullName: "Pete Crow-Armstrong", shortName: "P. Crow-Armstrong" });
    expect(splitSavantName("Ohtani")).toEqual({ fullName: "Ohtani", shortName: "Ohtani" });
  });
  it("ranks one column, skipping blanks", () => {
    expect(topFromArsenalCsv(CSV, "ff_avg_speed", 2)).toEqual([
      { pitcherId: 695243, value: 101.4, fullName: "Mason Miller", shortName: "M. Miller" },
      { pitcherId: 676979, value: 96.4, fullName: "Garrett Crochet", shortName: "G. Crochet" },
    ]);
  });
});
