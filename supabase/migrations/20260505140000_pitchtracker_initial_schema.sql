-- pitchtracker initial schema
-- All tables prefixed with pitch_ to coexist with the affiliates schema.
-- mlb_id-style integer primary keys are used directly (not surrogate uuids)
-- because they are stable and the natural key from the upstream APIs.

-- =====================================================================
-- pitch_teams: 30 MLB teams. Refreshed annually.
-- =====================================================================
create table public.pitch_teams (
  mlb_id        bigint primary key,
  abbreviation  text not null,
  name          text not null,
  division      text not null,
  league        text not null,
  updated_at    timestamptz not null default now()
);
alter table public.pitch_teams enable row level security;
create policy "pitch_teams: public read"
  on public.pitch_teams for select to anon, authenticated using (true);

-- =====================================================================
-- pitch_pitchers: ~1500 active and recently-active MLB pitchers.
-- =====================================================================
create table public.pitch_pitchers (
  mlb_id              bigint primary key,
  full_name           text not null,
  first_name          text,
  last_name           text,
  throws              char(1),
  current_team_id     bigint references public.pitch_teams(mlb_id) on delete set null,
  debut_year          int,
  last_active_year    int,
  updated_at          timestamptz not null default now()
);
create index pitch_pitchers_full_name_idx on public.pitch_pitchers (full_name);
create index pitch_pitchers_last_name_idx on public.pitch_pitchers (last_name);
create index pitch_pitchers_current_team_idx on public.pitch_pitchers (current_team_id);
alter table public.pitch_pitchers enable row level security;
create policy "pitch_pitchers: public read"
  on public.pitch_pitchers for select to anon, authenticated using (true);

-- =====================================================================
-- pitch_team_rosters: which pitchers threw for which team in which season.
-- A mid-season-traded pitcher appears under both teams for that season.
-- =====================================================================
create table public.pitch_team_rosters (
  team_id           bigint not null references public.pitch_teams(mlb_id) on delete cascade,
  season            int not null,
  pitcher_id        bigint not null references public.pitch_pitchers(mlb_id) on delete cascade,
  innings_pitched   numeric(6,1),
  updated_at        timestamptz not null default now(),
  primary key (team_id, season, pitcher_id)
);
create index pitch_team_rosters_pitcher_season_idx on public.pitch_team_rosters (pitcher_id, season);
create index pitch_team_rosters_team_season_idx on public.pitch_team_rosters (team_id, season);
alter table public.pitch_team_rosters enable row level security;
create policy "pitch_team_rosters: public read"
  on public.pitch_team_rosters for select to anon, authenticated using (true);

-- =====================================================================
-- pitch_games: one row per scheduled or completed MLB game.
-- =====================================================================
create table public.pitch_games (
  game_pk         bigint primary key,
  game_date       date not null,
  season          int not null,
  home_team_id    bigint references public.pitch_teams(mlb_id) on delete set null,
  away_team_id    bigint references public.pitch_teams(mlb_id) on delete set null,
  status          text not null,
  venue_name      text,
  updated_at      timestamptz not null default now()
);
create index pitch_games_date_idx on public.pitch_games (game_date desc);
create index pitch_games_season_idx on public.pitch_games (season);
create index pitch_games_home_team_idx on public.pitch_games (home_team_id, season);
create index pitch_games_away_team_idx on public.pitch_games (away_team_id, season);
alter table public.pitch_games enable row level security;
create policy "pitch_games: public read"
  on public.pitch_games for select to anon, authenticated using (true);

-- =====================================================================
-- pitch_game_pitches: pitch-by-pitch trajectory + outcome data, lazy-fetched
-- on first request from Savant per the hybrid caching strategy.
-- =====================================================================
create table public.pitch_game_pitches (
  game_pk             bigint not null references public.pitch_games(game_pk) on delete cascade,
  at_bat_number       int not null,
  pitch_number        int not null,

  pitcher_id          bigint references public.pitch_pitchers(mlb_id) on delete set null,
  batter_id           bigint,

  pitch_type          text,
  pitch_name          text,

  description         text,
  events              text,
  balls               int,
  strikes             int,
  outs_when_up        int,
  inning              int,
  inning_topbot       text,
  stand               char(1),
  p_throws            char(1),
  on_1b               bigint,
  on_2b               bigint,
  on_3b               bigint,

  release_pos_x       numeric,
  release_pos_y       numeric,
  release_pos_z       numeric,
  vx0                 numeric,
  vy0                 numeric,
  vz0                 numeric,
  ax                  numeric,
  ay                  numeric,
  az                  numeric,
  plate_x             numeric,
  plate_z             numeric,

  release_speed       numeric,
  release_spin_rate   numeric,
  spin_axis           numeric,
  pfx_x               numeric,
  pfx_z               numeric,
  effective_speed     numeric,
  release_extension   numeric,

  delta_run_exp       numeric,
  delta_home_win_exp  numeric,

  fetched_at          timestamptz not null default now(),

  primary key (game_pk, at_bat_number, pitch_number)
);
create index pitch_game_pitches_pitcher_idx on public.pitch_game_pitches (pitcher_id, game_pk);
create index pitch_game_pitches_pitcher_type_idx on public.pitch_game_pitches (pitcher_id, pitch_type);
create index pitch_game_pitches_at_bat_idx on public.pitch_game_pitches (game_pk, at_bat_number);
alter table public.pitch_game_pitches enable row level security;
create policy "pitch_game_pitches: public read"
  on public.pitch_game_pitches for select to anon, authenticated using (true);

-- =====================================================================
-- pitch_pitcher_aggregates: pre-computed per-pitcher per-pitch-type stats
-- per season, with batter-hand splits as separate rows ('L', 'R', '*').
-- Sourced from Savant's player-services endpoint.
-- =====================================================================
create table public.pitch_pitcher_aggregates (
  pitcher_id                  bigint not null references public.pitch_pitchers(mlb_id) on delete cascade,
  season                      int not null,
  pitch_type                  text not null,
  batter_hand                 char(1) not null check (batter_hand in ('L', 'R', '*')),

  pitch_count                 int,
  usage_pct                   numeric,

  avg_velocity                numeric,
  avg_spin_rate               numeric,
  avg_vertical_break          numeric,
  avg_horizontal_break        numeric,
  avg_induced_vertical_break  numeric,

  whiff_rate                  numeric,
  called_strike_rate          numeric,
  run_value_per_100           numeric,
  batting_avg_against         numeric,

  updated_at                  timestamptz not null default now(),

  primary key (pitcher_id, season, pitch_type, batter_hand)
);
create index pitch_pitcher_aggregates_pitcher_season_idx on public.pitch_pitcher_aggregates (pitcher_id, season);
alter table public.pitch_pitcher_aggregates enable row level security;
create policy "pitch_pitcher_aggregates: public read"
  on public.pitch_pitcher_aggregates for select to anon, authenticated using (true);
