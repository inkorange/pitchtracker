-- Re-key pitch_daily_features on the GAME date rather than the cron RUN date.
--
-- Background: the table was keyed (feature_kind, feature_date) where
-- feature_date was `new Date()` at cron time. Nothing tied a row to the
-- date of the game the pitch actually came from, so:
--
--   * The UI rendered feature_date as if it were the game date. When a
--     cron run failed (2026-08-28: refresh-notable-at-bats 504'd on its
--     60s limit) the previous day's row stayed put and *looked* current
--     — an 8/26 at-bat displayed as "2026-08-27". Downstream consumers
--     (the X poster's freshness guardrail) could not tell stale from
--     fresh without opening the at-bat page.
--   * Retrying a failed run wasn't idempotent: a second attempt on a
--     later calendar day wrote a NEW row rather than completing the
--     missing one.
--   * feature_date came from `today.toISOString()` (UTC) while the
--     selection window came from an ET-derived "yesterday", so the two
--     could disagree across the UTC midnight boundary.
--
-- Keying on game_date makes "do we have a pick for the 27th?" directly
-- answerable, makes retries naturally idempotent, and makes the
-- run-date/game-date mismatch structurally impossible.
--
-- feature_date is RETAINED (nullable) purely as an audit trail of when
-- the pick was computed. It is no longer part of the key and must not
-- be used for display.

alter table public.pitch_daily_features
  add column if not exists game_date date;

-- Backfill from the game the pick points at.
update public.pitch_daily_features f
set game_date = g.game_date
from public.pitch_games g
where g.game_pk = f.game_pk
  and f.game_date is null;

-- Legacy duplicates: before the "strict yesterday" window landed, the
-- job fell back to "most recent cached game date" and happily re-picked
-- the same game on consecutive days. That produced 50 rows across 121
-- distinct (feature_kind, game_date) pairs — 20 of which are the exact
-- same pitch featured more than once. Keep the EARLIEST computed row
-- for each pair (the day it genuinely was the pick) and drop the
-- re-picks, so the new primary key can be created.
delete from public.pitch_daily_features f
using (
  select
    ctid,
    row_number() over (
      partition by feature_kind, game_date
      order by feature_date asc, computed_at asc, ctid asc
    ) as rn
  from public.pitch_daily_features
) ranked
where f.ctid = ranked.ctid
  and ranked.rn > 1;

-- Any row whose game_pk no longer resolves (evicted season) can't be
-- keyed; drop it rather than leaving a null in the primary key.
delete from public.pitch_daily_features where game_date is null;

alter table public.pitch_daily_features
  alter column game_date set not null;

-- Drop the old key FIRST: Postgres refuses to drop NOT NULL on a column
-- while it still participates in a primary key (42P16).
alter table public.pitch_daily_features
  drop constraint pitch_daily_features_pkey;

alter table public.pitch_daily_features
  add constraint pitch_daily_features_pkey
  primary key (feature_kind, game_date);

alter table public.pitch_daily_features
  alter column feature_date drop not null;

-- Feed the "latest pick per kind" lookup the UI does on every render.
create index if not exists pitch_daily_features_kind_game_date_idx
  on public.pitch_daily_features (feature_kind, game_date desc);
