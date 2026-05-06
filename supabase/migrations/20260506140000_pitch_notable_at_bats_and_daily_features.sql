-- Daily content surfaces for Phase 4. Two tables:
--
-- pitch_notable_at_bats: scored at-bats from the last N days. Composite
-- score combines whiff count, strikeout flag, and max |delta_run_exp|
-- so the curated list mixes high-leverage outcomes with overpowering
-- pitch sequences.
--
-- pitch_daily_features: keyed by (kind, date) so we always have one
-- "Pitch of the Day" and one "Whiff of the Week" — the cron upserts
-- the row, no historical churn.

create table public.pitch_notable_at_bats (
  game_pk bigint not null references public.pitch_games(game_pk) on delete cascade,
  at_bat_number integer not null,
  pitcher_id bigint references public.pitch_pitchers(mlb_id) on delete set null,
  batter_id bigint,
  pitch_count integer not null,
  whiff_count integer not null default 0,
  is_strikeout boolean not null default false,
  max_abs_delta_run_exp numeric,
  score numeric not null,
  game_date date not null,
  computed_at timestamptz not null default now(),
  primary key (game_pk, at_bat_number)
);

create index pitch_notable_at_bats_score_idx
  on public.pitch_notable_at_bats (game_date desc, score desc);

alter table public.pitch_notable_at_bats enable row level security;

create policy "pitch_notable_at_bats: public read"
  on public.pitch_notable_at_bats
  for select
  to anon, authenticated
  using (true);

create table public.pitch_daily_features (
  feature_kind text not null check (feature_kind in ('pitch_of_the_day', 'whiff_of_the_week')),
  feature_date date not null,
  game_pk bigint not null references public.pitch_games(game_pk) on delete cascade,
  at_bat_number integer not null,
  pitch_number integer not null,
  pitcher_id bigint references public.pitch_pitchers(mlb_id) on delete set null,
  batter_id bigint,
  reason text,
  computed_at timestamptz not null default now(),
  primary key (feature_kind, feature_date)
);

alter table public.pitch_daily_features enable row level security;

create policy "pitch_daily_features: public read"
  on public.pitch_daily_features
  for select
  to anon, authenticated
  using (true);
