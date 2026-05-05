-- Break-onset distance: the y-position (feet from the plate) where a given
-- fraction of the pitch's total break has occurred. Defaults to 50%.
-- Smaller number = later / sharper break.
--
-- Math: break magnitude grows as 0.5·|a_break|·T² where T is time since
-- release. At threshold τ, T_τ = T_total · sqrt(τ). The function below
-- solves the y=50ft-frame quadratic to map T_τ back to a y position.

create or replace function public.pitch_break_onset_y(
  p_release_pos_y numeric,
  p_vy0 numeric,
  p_ay numeric,
  p_threshold numeric default 0.5
) returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  disc_release numeric;
  disc_plate numeric;
  t_release numeric;
  t_plate numeric;
  t_total numeric;
  t_at numeric;
begin
  if p_vy0 is null or p_ay is null or p_release_pos_y is null
     or p_ay = 0 or p_threshold is null or p_threshold <= 0 or p_threshold > 1 then
    return null;
  end if;
  disc_release := power(p_vy0, 2) - 2 * p_ay * (50 - p_release_pos_y);
  disc_plate := power(p_vy0, 2) - 2 * p_ay * 50;
  if disc_release < 0 or disc_plate < 0 then return null; end if;
  t_release := (-p_vy0 - sqrt(disc_release)) / p_ay;
  t_plate := (-p_vy0 - sqrt(disc_plate)) / p_ay;
  t_total := t_plate - t_release;
  if t_total <= 0 then return null; end if;
  t_at := t_release + t_total * sqrt(p_threshold);
  return 50 + p_vy0 * t_at + 0.5 * p_ay * t_at * t_at;
end;
$$;

grant execute on function public.pitch_break_onset_y(numeric, numeric, numeric, numeric)
  to anon, authenticated, service_role;

-- Add avg_break_onset_ft to the aggregates so the arsenal panel can render
-- it without recomputing on every page render.
alter table public.pitch_pitcher_aggregates
  add column if not exists avg_break_onset_ft numeric;

create or replace function public.pitch_recompute_aggregates()
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
    avg_break_onset_ft,
    whiff_rate, called_strike_rate
  )
  with pitches as (
    select
      p.pitcher_id, g.season, p.pitch_type,
      p.release_speed, p.release_spin_rate,
      p.release_pos_y, p.vy0, p.ay,
      p.pfx_x, p.pfx_z, p.description
    from public.pitch_game_pitches p
    join public.pitch_games g on g.game_pk = p.game_pk
    where p.pitcher_id is not null and p.pitch_type is not null
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
      avg(public.pitch_break_onset_y(p.release_pos_y, p.vy0, p.ay, 0.5))::numeric,
      1
    ) as avg_break_onset_ft,
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
    avg_break_onset_ft = excluded.avg_break_onset_ft,
    whiff_rate = excluded.whiff_rate,
    called_strike_rate = excluded.called_strike_rate,
    updated_at = now();
end;
$$;
