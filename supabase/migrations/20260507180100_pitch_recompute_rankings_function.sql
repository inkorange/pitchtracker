-- Computes the homepage rankings (top 5 per category) for a season.
-- Wipes pitch_rankings rows for the season and rebuilds in one
-- transaction. Min-pitches floor auto-scales by week of season:
-- 50 / week, capped at 1000 (all-pitch floor) and 0.4× that for the
-- FF-specific categories.
--
-- Categories:
--   velo_ff      avg FF velocity (mph)
--   spin_ff      avg FF spin rate (rpm)
--   vaa_flat_ff  avg FF Vertical Approach Angle, ranked by closest-to-0
--   whiff_pct    swinging strikes / pitches × 100 (per-pitch SwStr%)
--   csw_pct      (called + swinging) / pitches × 100
--   strikeouts   total strikeout-event count

create or replace function public.pitch_recompute_rankings(p_season int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := current_date;
  v_season_start date := make_date(p_season, 3, 25);
  v_weeks int := greatest(1, ((v_today - v_season_start) / 7));
  -- Per-pitch rate stats need a bigger sample to stabilize.
  v_floor_all int := least(1000, greatest(50, v_weeks * 50));
  -- Physical traits (velocity, spin rate, VAA) stabilize fast — a
  -- closer with 50 fastballs gives nearly the same mean as a starter
  -- with 500. Smaller FF floor so elite relievers (Mason Miller,
  -- Munoz, Helsley) can show up alongside starters.
  v_floor_ff int := greatest(20, v_weeks * 8);
begin
  delete from pitch_rankings where season = p_season;

  -- velo_ff
  insert into pitch_rankings (category, season, rank, pitcher_id, value, pitches_sampled)
  with top5 as (
    select pitcher_id, avg_velocity as v, pitch_count as n
    from pitch_pitcher_aggregates
    where season = p_season
      and pitch_type = 'FF'
      and batter_hand = '*'
      and pitch_count >= v_floor_ff
      and avg_velocity is not null
    order by avg_velocity desc
    limit 5
  )
  select 'velo_ff', p_season, row_number() over (order by v desc)::smallint, pitcher_id, v, n
  from top5;

  -- spin_ff
  insert into pitch_rankings (category, season, rank, pitcher_id, value, pitches_sampled)
  with top5 as (
    select pitcher_id, avg_spin_rate as v, pitch_count as n
    from pitch_pitcher_aggregates
    where season = p_season
      and pitch_type = 'FF'
      and batter_hand = '*'
      and pitch_count >= v_floor_ff
      and avg_spin_rate is not null
    order by avg_spin_rate desc
    limit 5
  )
  select 'spin_ff', p_season, row_number() over (order by v desc)::smallint, pitcher_id, v, n
  from top5;

  -- vaa_flat_ff: VAA = atan2(vz0 + az·t, |vy0|), t = (1.417 − 50) / vy0.
  -- Values are negative (ball descends); flat = closest to 0 = max value.
  insert into pitch_rankings (category, season, rank, pitcher_id, value, pitches_sampled)
  with ff as (
    select
      p.pitcher_id,
      atan2(p.vz0 + p.az * ((1.417 - 50.0) / p.vy0), abs(p.vy0)) * 180.0 / pi() as vaa
    from pitch_game_pitches p
    join pitch_games g on p.game_pk = g.game_pk
    where g.season = p_season
      and g.game_type = 'R'
      and p.pitch_type = 'FF'
      and p.vy0 is not null and p.vy0 < 0
      and p.vz0 is not null
      and p.az is not null
  ),
  per_p as (
    select pitcher_id, round(avg(vaa)::numeric, 2) as v, count(*)::int as n
    from ff group by pitcher_id
    having count(*) >= v_floor_ff
  ),
  top5 as (select * from per_p order by v desc limit 5)
  select 'vaa_flat_ff', p_season, row_number() over (order by v desc)::smallint, pitcher_id, v, n
  from top5;

  -- whiff_pct (per-pitch SwStr%)
  insert into pitch_rankings (category, season, rank, pitcher_id, value, pitches_sampled)
  with per_p as (
    select
      p.pitcher_id,
      round((sum(case when p.description = 'swinging_strike' then 1 else 0 end)::numeric / count(*) * 100)::numeric, 1) as v,
      count(*)::int as n
    from pitch_game_pitches p
    join pitch_games g on p.game_pk = g.game_pk
    where g.season = p_season
      and g.game_type = 'R'
      and p.pitcher_id is not null
    group by p.pitcher_id
    having count(*) >= v_floor_all
  ),
  top5 as (select * from per_p order by v desc limit 5)
  select 'whiff_pct', p_season, row_number() over (order by v desc)::smallint, pitcher_id, v, n
  from top5;

  -- csw_pct (per-pitch called + swinging)
  insert into pitch_rankings (category, season, rank, pitcher_id, value, pitches_sampled)
  with per_p as (
    select
      p.pitcher_id,
      round((sum(case when p.description in ('swinging_strike','called_strike') then 1 else 0 end)::numeric / count(*) * 100)::numeric, 1) as v,
      count(*)::int as n
    from pitch_game_pitches p
    join pitch_games g on p.game_pk = g.game_pk
    where g.season = p_season
      and g.game_type = 'R'
      and p.pitcher_id is not null
    group by p.pitcher_id
    having count(*) >= v_floor_all
  ),
  top5 as (select * from per_p order by v desc limit 5)
  select 'csw_pct', p_season, row_number() over (order by v desc)::smallint, pitcher_id, v, n
  from top5;

  -- strikeouts (total K events)
  insert into pitch_rankings (category, season, rank, pitcher_id, value, pitches_sampled)
  with per_p as (
    select p.pitcher_id, count(*)::int as v
    from pitch_game_pitches p
    join pitch_games g on p.game_pk = g.game_pk
    where g.season = p_season
      and g.game_type = 'R'
      and p.events in ('strikeout', 'strikeout_double_play')
      and p.pitcher_id is not null
    group by p.pitcher_id
  ),
  top5 as (select * from per_p order by v desc limit 5)
  select 'strikeouts', p_season, row_number() over (order by v desc)::smallint, pitcher_id, v, 0
  from top5;
end;
$$;

grant execute on function public.pitch_recompute_rankings(int) to service_role;
