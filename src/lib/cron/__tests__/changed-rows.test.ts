import { describe, expect, it } from "vitest";
import { pickChangedRows, fetchAllPaged } from "../changed-rows";

describe("pickChangedRows", () => {
  const COMPARED = ["name", "league"] as const;
  const row = (mlb_id: number, name: string, league: string) => ({
    mlb_id,
    name,
    league,
    updated_at: "2026-11-07T00:00:00.000Z",
  });

  it("writes nothing when every row matches — the offseason case", () => {
    // This is the whole point: a daily run over static data must issue
    // zero writes, not rewrite every row with a fresh updated_at.
    const incoming = [row(1, "Dodgers", "NL"), row(2, "Yankees", "AL")];
    const stored = new Map<number, Record<string, unknown>>([
      [1, { mlb_id: 1, name: "Dodgers", league: "NL" }],
      [2, { mlb_id: 2, name: "Yankees", league: "AL" }],
    ]);
    expect(
      pickChangedRows(incoming, stored, (r) => r.mlb_id, COMPARED),
    ).toEqual([]);
  });

  it("ignores updated_at, which is not evidence of a change", () => {
    const stored = new Map<number, Record<string, unknown>>([
      [1, { mlb_id: 1, name: "Dodgers", league: "NL", updated_at: "1999" }],
    ]);
    expect(
      pickChangedRows([row(1, "Dodgers", "NL")], stored, (r) => r.mlb_id, [
        ...COMPARED,
      ]),
    ).toEqual([]);
  });

  it("returns a row whose compared column moved", () => {
    const stored = new Map<number, Record<string, unknown>>([
      [1, { mlb_id: 1, name: "Old Name", league: "NL" }],
    ]);
    const out = pickChangedRows(
      [row(1, "Dodgers", "NL")],
      stored,
      (r) => r.mlb_id,
      COMPARED,
    );
    expect(out.map((r) => r.mlb_id)).toEqual([1]);
  });

  it("treats an unseen key as new and writes it", () => {
    const out = pickChangedRows(
      [row(7, "Rays", "AL")],
      new Map(),
      (r) => r.mlb_id,
      COMPARED,
    );
    expect(out.map((r) => r.mlb_id)).toEqual([7]);
  });

  it("does not treat a Postgres type round-trip as a change", () => {
    // An integer column can come back as a number where the cron built
    // a string. Diagnosing that as a change would write every row and
    // defeat the diff entirely.
    const incoming = [{ id: 1, season: "2026", team: 119 }];
    const stored = new Map<number, Record<string, unknown>>([
      [1, { id: 1, season: 2026, team: "119" }],
    ]);
    expect(
      pickChangedRows(incoming, stored, (r) => r.id, ["season", "team"]),
    ).toEqual([]);
  });

  it("treats null and undefined as the same absent value", () => {
    const incoming = [{ id: 1, venue: null as string | null }];
    const stored = new Map<number, Record<string, unknown>>([
      [1, { id: 1 }], // column absent entirely
    ]);
    expect(pickChangedRows(incoming, stored, (r) => r.id, ["venue"])).toEqual(
      [],
    );
  });

  it("detects a value appearing where there was none", () => {
    const incoming = [{ id: 1, venue: "Dodger Stadium" }];
    const stored = new Map<number, Record<string, unknown>>([
      [1, { id: 1, venue: null }],
    ]);
    expect(
      pickChangedRows(incoming, stored, (r) => r.id, ["venue"]),
    ).toHaveLength(1);
  });

  it("detects a value being cleared", () => {
    const incoming = [{ id: 1, venue: null as string | null }];
    const stored = new Map<number, Record<string, unknown>>([
      [1, { id: 1, venue: "Dodger Stadium" }],
    ]);
    expect(
      pickChangedRows(incoming, stored, (r) => r.id, ["venue"]),
    ).toHaveLength(1);
  });

  it("returns each changed row once even when several columns differ", () => {
    const stored = new Map<number, Record<string, unknown>>([
      [1, { mlb_id: 1, name: "Old", league: "AL" }],
    ]);
    expect(
      pickChangedRows([row(1, "New", "NL")], stored, (r) => r.mlb_id, COMPARED),
    ).toHaveLength(1);
  });
});

describe("fetchAllPaged", () => {
  it("walks past the 1000-row ceiling that .range() does not lift", async () => {
    const total = 2300;
    const all = Array.from({ length: total }, (_, i) => ({ n: i }));
    const calls: Array<[number, number]> = [];
    const out = await fetchAllPaged<{ n: number }>(async (f, t) => {
      calls.push([f, t]);
      return { data: all.slice(f, t + 1), error: null };
    });
    expect(out).toHaveLength(total);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops after one page when the table is smaller than a page", async () => {
    let pages = 0;
    const out = await fetchAllPaged<{ n: number }>(async () => {
      pages += 1;
      return { data: [{ n: 1 }], error: null };
    });
    expect(out).toHaveLength(1);
    expect(pages).toBe(1);
  });

  it("stops on an exact multiple of the page size without looping forever", async () => {
    const all = Array.from({ length: 1000 }, (_, i) => ({ n: i }));
    let pages = 0;
    const out = await fetchAllPaged<{ n: number }>(async (f, t) => {
      pages += 1;
      return { data: all.slice(f, t + 1), error: null };
    });
    expect(out).toHaveLength(1000);
    // Page 1 is full, so a second request is required to learn it ended.
    expect(pages).toBe(2);
  });

  it("throws on a read error rather than silently writing every row", async () => {
    // Swallowing this would leave `stored` empty, which pickChangedRows
    // reads as "every row is new" — the exact amplification being fixed.
    await expect(
      fetchAllPaged(async () => ({ data: null, error: { message: "boom" } })),
    ).rejects.toThrow("boom");
  });
});
