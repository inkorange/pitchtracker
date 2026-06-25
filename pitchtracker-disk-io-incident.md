# PitchTracker — Supabase Disk IO Spike (2026-06-04)

## TL;DR

A bulk backfill of **1,733 games / 92,484 pitches** ran today and the ingestion
pipeline called `pitch_recompute_aggregates()` after each game. That function
**full-scans the entire `pitch_game_pitches` table (377 MB / 865K rows) on every
call**, so ~1,700 full table scans hit the disk in one ~8-hour window. That drove
the Portfolio DB Disk IO budget to 15%.

The spike is self-limiting (Supabase Disk IO is a burst balance that refills once
load stops). The fix is to stop calling the recompute per-game and/or make it
incremental.

---

## Evidence

### 1. Abnormal ingestion today
Normal daily ingestion is ~4,000 pitches across ~15 games. Today:

| Day | Pitches inserted |
|---|---|
| 2026-05-30 | 4,390 |
| 2026-05-31 | 3,671 |
| 2026-06-01 | 5,261 |
| 2026-06-02 | 2,714 |
| 2026-06-03 | 4,505 |
| **2026-06-04** | **92,484** |

- **1,733 distinct games** ingested, 11:05–19:07 UTC (77 active minutes).
- ~20× a normal day → a historical backfill / re-ingestion, not live play.

### 2. The dominant disk consumer
From `pg_stat_statements` (cumulative since 2025-11-03):

| Query | Calls | Disk read | Total exec |
|---|---|---|---|
| **`pitch_recompute_aggregates()`** (RPC) | 1,566 | **165 GB** | 9.25 hrs (mean 21 s/call) |
| `pitch_game_pitches` upserts | ~18,700 | ~1 GB | — |
| everything else | — | < 8 GB each | — |

The recompute RPC dwarfs everything. Recent Postgres logs show 180 invocations in
the last 24h window alone, lining up with the per-game backfill calls.

### 3. Why each call is so expensive
`pitch_recompute_aggregates()`:
- Reads **all** of `pitch_game_pitches` joined to `pitch_games`.
- Aggregates **every pitcher across every season** — no scoping to changed rows.
- Upserts into `pitch_pitcher_aggregates`.
- Cost grows with total table size, so it gets worse every season.

Called once per game during a 1,733-game backfill = ~1,700 full-table scans.

### 4. Not a cron / not the DB itself
- `pg_cron` is **not installed** — calls come from the app/cron over the REST API
  (PostgREST RPC wrapper visible in the captured statements).

---

## Fixes (in order of impact)

### 1. Don't recompute per-game during backfills ⭐ biggest win
Ingest all games first, then call `pitch_recompute_aggregates()` **once** at the
end. Turns ~1,700 full scans into 1.

- Find the ingestion code that calls the recompute RPC and move the call outside
  the per-game loop (batch-level or end-of-run only).

### 2. Make the recompute incremental
Add parameters so it only recomputes affected rows instead of the whole table:

```sql
-- e.g. scope by season (and optionally pitcher set)
create or replace function public.pitch_recompute_aggregates(p_season int default null)
...
  -- in the `pitches` CTE:
  where p.pitcher_id is not null
    and p.pitch_type is not null
    and (p_season is null or g.season = p_season)
```

A single-season backfill should not rescan every season ever recorded.
(Note: `usage_pct`/`totals` are computed per `(pitcher_id, season)`, so scoping by
season keeps the math correct.)

### 3. Index support (secondary)
A full-aggregate recompute reads the whole table regardless, so an index won't
help the "recompute everything" path much. Indexing matters more for the
per-pitcher read queries. Fix #1 and #2 first.

### Advisory cleanup (low priority, unrelated to the spike)
Supabase performance advisor also flagged:
- Unindexed foreign keys: `pitch_daily_features` (game_pk, pitcher_id),
  `pitch_notable_at_bats.pitcher_id`, `pitch_pitcher_games.game_pk`,
  `pitch_rankings.pitcher_id`.
- Many unused indexes on `pitch_*` name/dmetaphone columns and the `bases_*`
  tables — candidates for removal to cut write/IO overhead.

---

## Verification after changes
- Re-run a small backfill and confirm only **one** `pitch_recompute_aggregates`
  call appears per run.
- Watch `shared_blks_read` for the function in `pg_stat_statements`
  (reset with `select pg_stat_statements_reset();` to get a clean baseline).
- Confirm the Disk IO budget chart flattens on the next ingestion day.

## Reference: project
- Supabase project: **Portfolio** (`xezajyyeqbgjqjshmuir`), region us-east-2, PG 17.
- Largest table: `pitch_game_pitches` — 485 MB total / 377 MB heap / 865,804 rows.
