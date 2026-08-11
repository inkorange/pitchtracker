-- Leaderboard caching — cuts Supabase Disk IO from the two leaderboard
-- RPCs that were full-scanning the 377 MB pitch_game_pitches heap on
-- every homepage load.
--
-- Before: pitch_top_velocity + pitch_top_strikeouts each scan the whole
--   pitch_game_pitches heap on every call, grouping by pitcher_id. Mean
--   runtime 6-12s, tail up to 12.3s. Combined ~7,500 full-table scans
--   per day (traffic-driven; each pageview fires both). Together they
--   burned 159 GB of disk reads since 2025-11-03 and became the top
--   Disk IO consumers on the Supabase Portfolio project.
--
-- After: two materialized views hold the pre-aggregated leaderboard
--   output. The RPCs are rewritten as thin readers that hit the MV
--   (few thousand rows, indexed on pitcher_id). ~7,500 full scans/day
--   collapse to 2 refreshes/day — one per MV — fired by the daily
--   refresh-rankings cron after ingest settles.
--
-- Signatures are preserved so the frontend needs no changes:
--   pitch_top_velocity(p_days, p_limit, p_min_pitches)
--   pitch_top_strikeouts(p_season, p_limit)
--
-- p_days is now IGNORED in the velocity RPC (the MV is a fixed
-- 7-day window). If the UI ever adds a 30-day toggle, add a
-- pitch_top_velocity_30d MV and branch on p_days in the RPC.

-- ---------------------------------------------------------------
-- Supporting indexes — partial relief for any live scan path that
-- lands outside the MV (ad-hoc queries, on-demand backfills, etc.).
-- Kept narrow with WHERE clauses so they don't bloat the heap.
-- ---------------------------------------------------------------
create index if not exists idx_pgp_type_speed
  on public.pitch_game_pitches (game_pk, pitch_type)
  where release_speed is not null;

create index if not exists idx_pgp_strikeouts
  on public.pitch_game_pitches (game_pk)
  where events in ('strikeout', 'strikeout_double_play');

create index if not exists idx_games_date_type
  on public.pitch_games (game_date, game_type);

create index if not exists idx_games_season_type
  on public.pitch_games (season, game_type);

-- ---------------------------------------------------------------
-- Fastball velocity — rolling 7-day window.
--
-- No LIMIT / min-pitches filter here; the RPC applies p_limit and
-- p_min_pitches on read so the same MV can back both the 10-name
-- /velocity_leaders page and the 12-name FeaturedStrip pool.
-- ---------------------------------------------------------------
drop materialized view if exists public.pitch_top_velocity_7d;
create materialized view public.pitch_top_velocity_7d as
  select
    p.pitcher_id::bigint as pitcher_id,
    round(avg(p.release_speed)::numeric, 1) as avg_velo,
    count(*)::int as fb_pitches
  from public.pitch_game_pitches p
  join public.pitch_games g on g.game_pk = p.game_pk
  where g.game_date > current_date - make_interval(days => 7)
    and g.game_type = 'R'
    and p.pitch_type in ('FF', 'SI')
    and p.release_speed is not null
    and p.pitcher_id is not null
  group by p.pitcher_id;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
create unique index if not exists idx_pitch_top_velocity_7d_pitcher
  on public.pitch_top_velocity_7d (pitcher_id);

-- ---------------------------------------------------------------
-- Strikeouts — current season (auto-detected via max(season) at
-- refresh time, so the MV flips over on Opening Day without a code
-- change).
-- ---------------------------------------------------------------
drop materialized view if exists public.pitch_top_strikeouts_current;
create materialized view public.pitch_top_strikeouts_current as
  select
    p.pitcher_id::bigint as pitcher_id,
    count(*)::int as strikeouts,
    g.season
  from public.pitch_game_pitches p
  join public.pitch_games g on g.game_pk = p.game_pk
  where g.game_type = 'R'
    and p.events in ('strikeout', 'strikeout_double_play')
    and p.pitcher_id is not null
    and g.season = (select max(season) from public.pitch_games)
  group by p.pitcher_id, g.season;

create unique index if not exists idx_pitch_top_strikeouts_current_pitcher
  on public.pitch_top_strikeouts_current (pitcher_id);

-- ---------------------------------------------------------------
-- Refresh entry point — called at the tail of the daily analytics
-- chain by /api/cron/refresh-rankings once pitches have settled.
-- CONCURRENTLY takes an ACCESS SHARE lock instead of ACCESS
-- EXCLUSIVE, so leaderboard reads keep serving during the rebuild.
-- ---------------------------------------------------------------
create or replace function public.pitch_refresh_leaderboards()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.pitch_top_velocity_7d;
  refresh materialized view concurrently public.pitch_top_strikeouts_current;
end;
$$;

grant execute on function public.pitch_refresh_leaderboards() to service_role;

-- ---------------------------------------------------------------
-- RPCs — rewritten as thin readers of the materialized views.
-- Signatures unchanged so no frontend code moves.
-- ---------------------------------------------------------------
create or replace function public.pitch_top_velocity(
  p_days int default 7,
  p_limit int default 10,
  p_min_pitches int default 20
)
returns table (
  rank smallint,
  pitcher_id bigint,
  avg_velo numeric,
  fb_pitches int
)
language sql
security definer
set search_path = public
as $$
  -- p_days is currently IGNORED — pitch_top_velocity_7d is fixed at
  -- a 7-day window (the only window the UI asks for). If a 30-day
  -- toggle ever ships, add a matching MV and branch on p_days here.
  select
    row_number() over (order by v.avg_velo desc, v.fb_pitches desc)::smallint as rank,
    v.pitcher_id,
    v.avg_velo,
    v.fb_pitches
  from public.pitch_top_velocity_7d v
  where v.fb_pitches >= p_min_pitches
  order by v.avg_velo desc, v.fb_pitches desc
  limit p_limit;
$$;

grant execute on function public.pitch_top_velocity(int, int, int)
  to anon, authenticated, service_role;

-- Keep the safety-net timeout — the MV read is < 50ms in practice
-- but the anon-role SLA budget is set on the function signature.
alter function public.pitch_top_velocity(int, int, int)
  set statement_timeout = '30s';

create or replace function public.pitch_top_strikeouts(
  p_season int,
  p_limit int default 10
)
returns table (
  rank smallint,
  pitcher_id bigint,
  strikeouts int
)
language sql
security definer
set search_path = public
as $$
  select
    row_number() over (order by s.strikeouts desc)::smallint as rank,
    s.pitcher_id,
    s.strikeouts
  from public.pitch_top_strikeouts_current s
  where s.season = p_season
  order by s.strikeouts desc
  limit p_limit;
$$;

grant execute on function public.pitch_top_strikeouts(int, int)
  to anon, authenticated, service_role;
