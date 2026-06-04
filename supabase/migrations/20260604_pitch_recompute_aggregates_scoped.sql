-- Scope pitch_recompute_aggregates() so a single cache miss doesn't
-- trigger a 377-MB full-table scan.
--
-- Background: on 2026-06-04 a multi-game backfill drove the Portfolio
-- DB Disk IO budget to 15% in one 8-hour window. The function was
-- being called once per game during the backfill, and each call
-- re-aggregated EVERY pitcher × EVERY season from raw pitches —
-- ~1,700 full scans where one scoped recompute would do.
--
-- The new signature accepts two optional params:
--   p_pitcher_id  scope to a single pitcher (NULL = all pitchers)
--   p_season      scope to a single season  (NULL = all seasons)
--
-- The daily refresh-aggregates cron passes p_season=current-year so
-- frozen historical seasons aren't rescanned daily. On-demand callers
-- (ensurePitcherSeasonCache) pass both so a first-visit cache miss
-- only re-aggregates that pitcher's season slice.

drop function if exists public.pitch_recompute_aggregates();

create or replace function public.pitch_recompute_aggregates(
  p_pitcher_id int default null,
  p_season int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pitch_pitcher_aggregates (
    pitcher_id, season, pitch_type, batter_hand,
    pitch_count, usage_pct,
    avg_velocity, avg_spin_rate,
    avg_horizontal_break, avg_induced_vertical_break,
    whiff_rate, called_strike_rate
  )
  with pitches as (
    select
      p.pitcher_id, g.season, p.pitch_type,
      p.release_speed, p.release_spin_rate,
      p.pfx_x, p.pfx_z, p.description
    from public.pitch_game_pitches p
    join public.pitch_games g on g.game_pk = p.game_pk
    where p.pitcher_id is not null
      and p.pitch_type is not null
      and (p_pitcher_id is null or p.pitcher_id = p_pitcher_id)
      and (p_season is null or g.season = p_season)
  ),
  totals as (
    select pitcher_id, season, count(*)::numeric as n
    from pitches group by pitcher_id, season
  )
  select
    p.pitcher_id, p.season, p.pitch_type, '*'::char(1) as batter_hand,
    count(*)::int as pitch_count,
    round(count(*)::numeric * 100 / t.n, 1) as usage_pct,
    round(avg(p.release_speed)::numeric, 1) as avg_velocity,
    round(avg(p.release_spin_rate)::numeric, 0) as avg_spin_rate,
    round((avg(-p.pfx_x) * 12)::numeric, 1) as avg_horizontal_break,
    round((avg(p.pfx_z) * 12)::numeric, 1) as avg_induced_vertical_break,
    round(
      (sum(case when p.description = 'swinging_strike' then 1 else 0 end)::numeric * 100
       / nullif(sum(case when p.description in ('swinging_strike','foul_tip','hit_into_play','foul') then 1 else 0 end), 0)),
      1
    ) as whiff_rate,
    round(
      (sum(case when p.description = 'called_strike' then 1 else 0 end)::numeric * 100 / count(*)),
      1
    ) as called_strike_rate
  from pitches p
  join totals t on t.pitcher_id = p.pitcher_id and t.season = p.season
  group by p.pitcher_id, p.season, p.pitch_type, t.n
  on conflict (pitcher_id, season, pitch_type, batter_hand) do update set
    pitch_count = excluded.pitch_count,
    usage_pct = excluded.usage_pct,
    avg_velocity = excluded.avg_velocity,
    avg_spin_rate = excluded.avg_spin_rate,
    avg_horizontal_break = excluded.avg_horizontal_break,
    avg_induced_vertical_break = excluded.avg_induced_vertical_break,
    whiff_rate = excluded.whiff_rate,
    called_strike_rate = excluded.called_strike_rate,
    updated_at = now();
end;
$$;

-- Re-apply the statement_timeout from 20260525 (the old signature is
-- gone, so the prior alter reference is stale).
alter function public.pitch_recompute_aggregates(int, int)
  set statement_timeout = '180s';

grant execute on function public.pitch_recompute_aggregates(int, int) to service_role;
