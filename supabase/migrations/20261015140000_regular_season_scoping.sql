-- Keep the comparative surfaces regular-season-only, now that
-- postseason pitches are actually ingested.
--
-- Context: until 2026-10-15 the precache cron filtered game_type = 'R',
-- so no postseason pitch ever reached pitch_game_pitches and nothing
-- downstream had to think about it. That filter is gone (the playoffs
-- were invisible on the site), which means every consumer of the raw
-- pitch table now has to say what it wants.
--
-- The split we want:
--
--   Pitcher detail page  -> regular season + postseason. Someone
--                           looking at a pitcher wants to see his
--                           October work. Handled in the app layer;
--                           the page derives its arsenal chips in JS
--                           from the pitch rows it renders, so
--                           widening the query was sufficient.
--
--   Leaderboards,        -> regular season ONLY. These rank pitchers
--   rankings,               against each other, and postseason
--   percentile radar        innings are both unevenly distributed
--                           (most pitchers have none) and played
--                           against stronger lineups. Blending them
--                           would make the comparison meaningless.
--
-- pitch_recompute_aggregates was the one consumer with no game_type
-- filter at all, so it would have started quietly absorbing postseason
-- pitches on the first nightly run after ingest was fixed. It feeds the
-- velo/spin ranking categories and the percentile radar, both of which
-- are comparative, so it belongs on the regular-season side.

create or replace function public.pitch_recompute_aggregates(
  p_pitcher_id integer default null::integer,
  p_season integer default null::integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '180s'
as $function$
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
      -- Added 2026-10-15. These aggregates back comparative features
      -- (ranking categories, percentile radar), so they must stay
      -- regular-season-only even though the table now holds postseason
      -- pitches too.
      and g.game_type = 'R'
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
$function$;


-- Separately: pitch_top_strikeouts_current scoped itself with
--   season = (select max(season) from pitch_games)
-- which reads the SCHEDULE table, not the data. pitch_games carries
-- future games (refresh-games loads a next-7-days window), so as soon
-- as the first game of a new season enters that window — spring
-- training, months before any Statcast is published — max(season)
-- advances and this view goes empty.
--
-- That is the same calendar-vs-data confusion fixed in the application
-- layer by lib/season/current-season.ts, living on in SQL where that
-- fix cannot reach. Scoping to the max season among rows the view
-- actually selects makes it self-contained: no dependency on the
-- schedule table, on the aggregates table, or on wall-clock time.
--
-- A materialized view cannot be CREATE OR REPLACE'd, so this drops and
-- recreates it along with the unique index REFRESH ... CONCURRENTLY
-- requires and the grants it carried.

drop materialized view if exists public.pitch_top_strikeouts_current;

create materialized view public.pitch_top_strikeouts_current as
with scoped as (
  select p.pitcher_id, g.season
  from public.pitch_game_pitches p
  join public.pitch_games g on g.game_pk = p.game_pk
  where g.game_type = 'R'
    and p.events = any (array['strikeout', 'strikeout_double_play'])
    and p.pitcher_id is not null
)
select
  pitcher_id,
  count(*)::integer as strikeouts,
  season
from scoped
where season = (select max(season) from scoped)
group by pitcher_id, season;

create unique index idx_pitch_top_strikeouts_current_pitcher
  on public.pitch_top_strikeouts_current using btree (pitcher_id);

grant all on public.pitch_top_strikeouts_current to postgres;
grant all on public.pitch_top_strikeouts_current to anon;
grant all on public.pitch_top_strikeouts_current to authenticated;
grant all on public.pitch_top_strikeouts_current to service_role;
