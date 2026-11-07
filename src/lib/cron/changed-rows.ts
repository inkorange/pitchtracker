// Write only what actually changed.
//
// Every metadata cron used to upsert its full row set on each run with
// `updated_at: new Date().toISOString()`. That column alone made every
// row differ from what was stored, so Postgres rewrote all of them
// daily whether or not the data had moved: a new tuple version, an
// entry in every index on the table, WAL records for both, and the
// autovacuum pass that later reclaims the dead tuple.
//
// In the offseason none of this data changes, so the whole thing was
// write amplification — roughly 3,600 rows a day rewritten to store
// identical values, across pitch_games, pitch_pitchers,
// pitch_team_rosters, pitch_batters and pitch_teams. It was the last
// meaningful source of disk IO after the pitch-table cron chain was
// retired, and it is what kept autovacuum firing on pitch_pitchers and
// pitch_teams every single day.
//
// Diffing first makes the steady state free. Every table involved is
// under 3 MB and fully resident in cache, so reading the current values
// back costs far less than rewriting each row — and in the offseason
// the comparison finds nothing to write at all.

/**
 * Equality as Postgres round-trips it.
 *
 * A value read back from PostgREST does not always have the JS type it
 * was written with — an integer column can come back as a number where
 * the cron built a string, and a missing value can be either null or
 * undefined. Comparing loosely avoids diagnosing those as changes and
 * writing the row anyway, which would defeat the point.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return String(a) === String(b);
}

/**
 * Keep only the incoming rows whose compared columns differ from the
 * stored row, plus any row that does not exist yet.
 *
 * `compareKeys` deliberately excludes `updated_at`: that column is the
 * cause of the amplification, not evidence of a change, so it is
 * carried along on the rows that are written and ignored otherwise.
 */
export function pickChangedRows<
  K extends string | number,
  T extends Record<string, unknown>,
>(
  incoming: T[],
  stored: Map<K, Record<string, unknown>>,
  keyOf: (row: T) => K,
  compareKeys: readonly (keyof T & string)[],
): T[] {
  const out: T[] = [];
  for (const row of incoming) {
    const current = stored.get(keyOf(row));
    if (!current) {
      out.push(row);
      continue;
    }
    for (const k of compareKeys) {
      if (!sameValue(row[k], current[k])) {
        out.push(row);
        break;
      }
    }
  }
  return out;
}

/** PostgREST caps a response at 1000 rows regardless of `.range()`. */
const PAGE = 1000;

/**
 * Read every row of a select, a page at a time.
 *
 * `.range()` does not raise the server's 1000-row ceiling, it only
 * moves the window, so anything that can exceed it has to be walked.
 * `pitch_games` does: the window is 30 days back plus 7 forward, which
 * in season is well over a thousand rows.
 */
export async function fetchAllPaged<R>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
): Promise<R[]> {
  const all: R[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await page(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) return all;
  }
}
