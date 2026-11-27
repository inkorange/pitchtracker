import { parseCsv } from "@/lib/savant/client";

// Pure parsing for past-season leaderboards (see history.ts).

export interface ArsenalLeader {
  pitcherId: number;
  /** "F. Last" */
  shortName: string;
  /** "First Last" */
  fullName: string;
  value: number;
}

/** Savant's "Last, First" → full and short names. */
export function splitSavantName(lastFirst: string): { fullName: string; shortName: string } {
  const [last, first] = lastFirst.split(",").map((s) => s.trim());
  if (!first) return { fullName: last, shortName: last };
  return { fullName: `${first} ${last}`, shortName: `${first[0]}. ${last}` };
}

/**
 * Top `limit` pitchers by one column of Savant's pitch-arsenals CSV
 * (e.g. `ff_avg_speed`), highest first. Rows without a value are skipped.
 */
export function topFromArsenalCsv(csv: string, column: string, limit: number): ArsenalLeader[] {
  return parseCsv(csv)
    .map((r) => ({ r, v: Number(r[column]) }))
    .filter(({ r, v }) => r[column] !== "" && r[column] != null && Number.isFinite(v) && /^\d+$/.test(r.pitcher ?? ""))
    .sort((a, b) => b.v - a.v)
    .slice(0, limit)
    .map(({ r, v }) => ({ pitcherId: Number(r.pitcher), value: v, ...splitSavantName(r["last_name, first_name"] ?? "") }));
}
