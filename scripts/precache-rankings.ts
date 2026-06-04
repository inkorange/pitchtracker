/* eslint-disable @typescript-eslint/no-require-imports */
// One-shot: backfill every active pitcher's season pitches, recompute
// aggregates, recompute rankings. Mirrors the production cron chain
// (precache → aggregates → rankings) but runs locally against the
// project's existing SUPABASE_SERVICE_ROLE_KEY in .env.local.
//
//   pnpm exec tsx scripts/precache-rankings.ts [season]

import { config } from "dotenv";
config({ path: ".env.local" });

import { ensurePitcherSeasonCache } from "../src/lib/cache/backfill";
import { createAdminClient } from "../src/lib/supabase/admin";

const CONCURRENCY = 6;

async function main() {
  const season = Number(process.argv[2]) || new Date().getFullYear();
  const supabase = createAdminClient();

  console.log(`[precache] season=${season}`);
  const { data: pitchers, error } = await supabase
    .from("pitch_pitchers")
    .select("mlb_id, full_name")
    .eq("last_active_year", season);
  if (error) throw new Error(error.message);
  const list = pitchers ?? [];
  console.log(`[precache] active pitchers: ${list.length}`);

  let done = 0;
  let failed = 0;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (p) => {
        try {
          // skipRecompute: the in-loop calls are followed by one
          // explicit recompute at the end of this script. Without
          // this flag each per-pitcher backfill would fire its own
          // scoped recompute — fine in isolation, but redundant
          // when we're going to walk every pitcher and then
          // recompute the whole table anyway.
          await ensurePitcherSeasonCache(p.mlb_id, season, {
            skipRecompute: true,
          });
        } catch (err) {
          failed += 1;
          console.warn(
            `[precache] ${p.full_name} (${p.mlb_id}) failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }),
    );
    done += batch.length;
    if (done % 60 === 0 || done === list.length) {
      console.log(`[precache] ${done}/${list.length}`);
    }
  }
  console.log(`[precache] done. failed=${failed}`);

  console.log(`[aggregates] recomputing season ${season}…`);
  const aggRes = await supabase.rpc("pitch_recompute_aggregates", {
    p_pitcher_id: null,
    p_season: season,
  });
  if (aggRes.error) throw new Error(aggRes.error.message);
  console.log(`[aggregates] done.`);

  console.log(`[rankings] recomputing for season ${season}…`);
  const rkRes = await supabase.rpc("pitch_recompute_rankings", { p_season: season });
  if (rkRes.error) throw new Error(rkRes.error.message);
  console.log(`[rankings] done.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
