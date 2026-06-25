-- Top-N strikeouts per pitcher for a season. Source for the
-- /strikeout_leaders screenshot page that an external X.com scheduler
-- captures and posts weekly. Kept as its own function (rather than
-- bumping pitch_recompute_rankings to 10) so the homepage rankings
-- strip can stay at top-5 without an extra slice on the read side.
--
-- p_limit is a parameter so the same function backs ad-hoc "top 25"
-- queries later if we want a longer list for other surfaces.

create or replace function public.pitch_top_strikeouts(
  p_season int,
  p_limit int default 10
)
returns table (rank smallint, pitcher_id bigint, strikeouts int)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      p.pitcher_id::bigint as pitcher_id,
      count(*)::int as strikeouts
    from pitch_game_pitches p
    join pitch_games g on p.game_pk = g.game_pk
    where g.season = p_season
      and g.game_type = 'R'
      and p.events in ('strikeout', 'strikeout_double_play')
      and p.pitcher_id is not null
    group by p.pitcher_id
    order by count(*) desc
    limit p_limit
  )
  select
    row_number() over (order by strikeouts desc)::smallint as rank,
    pitcher_id,
    strikeouts
  from ranked;
$$;

grant execute on function public.pitch_top_strikeouts(int, int) to anon, authenticated, service_role;
