-- Frees DB space by purging seasons older than p_keep_through.
-- Current architecture keeps current + previous season hot in
-- pitch_game_pitches; older data is lazily re-fetched from Savant on
-- demand via the existing ensurePitcherSeasonCache machinery when a
-- user navigates to an old season.
--
-- Called daily by /api/cron/evict-old-seasons.
-- Returns deleted row counts per table for monitoring.

create or replace function public.pitch_evict_old_seasons(p_keep_through int)
returns table(
  pitches_deleted bigint,
  pitcher_games_deleted bigint,
  aggregates_deleted bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pitches bigint;
  v_pg bigint;
  v_agg bigint;
begin
  with old_games as (
    select game_pk from pitch_games where season < p_keep_through
  ),
  d as (
    delete from pitch_game_pitches
    where game_pk in (select game_pk from old_games)
    returning 1
  )
  select count(*) into v_pitches from d;

  with old_games as (
    select game_pk from pitch_games where season < p_keep_through
  ),
  d as (
    delete from pitch_pitcher_games
    where game_pk in (select game_pk from old_games)
    returning 1
  )
  select count(*) into v_pg from d;

  with d as (
    delete from pitch_pitcher_aggregates
    where season < p_keep_through
    returning 1
  )
  select count(*) into v_agg from d;

  -- Intentionally keep pitch_games rows: only ~2MB total, gives us
  -- game-level metadata for sitemap + the schedule join even when
  -- the pitch detail is gone.

  pitches_deleted := v_pitches;
  pitcher_games_deleted := v_pg;
  aggregates_deleted := v_agg;
  return next;
end;
$$;

grant execute on function public.pitch_evict_old_seasons(int) to service_role;
