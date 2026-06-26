-- Top-N average fastball velocity per pitcher over a rolling N-day
-- window. Source for the /velocity_leaders screenshot page captured by
-- the external X.com weekly scheduler skill.
--
-- Why a rolling window instead of a season-to-date average: season
-- averages flatten out as the year goes on and end up dominated by the
-- same 8-10 starters every week, so the weekly post would have stale
-- names. A 7-day window surfaces high-leverage relievers (Mason Miller,
-- Munoz, Henriquez) whose 2-3 appearances per week wouldn't move a
-- season average but are exactly the names that go viral on baseball
-- Twitter.
--
-- Fastball definition: FF (four-seam) + SI (sinker). Excludes FC
-- (cutter, ~89 mph avg) because it would drag the velo for cutter-
-- heavy arms and underrate true fastball-first throwers. Off-speed
-- (SL/CH/CU/etc.) is obviously out.
--
-- p_min_pitches gates against single-appearance noise: a mop-up
-- reliever who threw 6 fastballs at 101 shouldn't outrank a closer
-- with 30 fastballs averaging 100. Defaulted to 20 — roughly 2 short
-- relief outings or one full SP start.

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
  with fb as (
    select
      p.pitcher_id::bigint as pitcher_id,
      p.release_speed
    from pitch_game_pitches p
    join pitch_games g on g.game_pk = p.game_pk
    where g.game_date > current_date - make_interval(days => p_days)
      and g.game_type = 'R'
      and p.pitch_type in ('FF', 'SI')
      and p.release_speed is not null
      and p.pitcher_id is not null
  ),
  ranked as (
    select
      pitcher_id,
      round(avg(release_speed)::numeric, 1) as avg_velo,
      count(*)::int as fb_pitches
    from fb
    group by pitcher_id
    having count(*) >= p_min_pitches
    order by avg(release_speed) desc
    limit p_limit
  )
  select
    row_number() over (order by avg_velo desc, fb_pitches desc)::smallint as rank,
    pitcher_id,
    avg_velo,
    fb_pitches
  from ranked;
$$;

grant execute on function public.pitch_top_velocity(int, int, int) to anon, authenticated, service_role;

-- 7-day windowed query is much lighter than the season-wide K scan
-- (~28k rows vs full table scan), but mirror the K function's timeout
-- override anyway — keeps anon-role SLA budget consistent across all
-- leaderboard RPCs and gives headroom if the window param grows later.
alter function public.pitch_top_velocity(int, int, int)
  set statement_timeout = '30s';
