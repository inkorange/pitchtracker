-- Daily-refreshed leaderboards for the homepage. One row per
-- (category, season, rank); the cron upserts in place so the
-- homepage always reads the latest five per category without
-- historical churn.
--
-- Categories:
--   velo_ff        — average four-seam velocity (mph), descending
--   spin_ff        — average four-seam spin rate (rpm), descending
--   vaa_flat_ff    — flattest VAA on FF (closest to 0°), ranked by
--                    least-negative absolute value
--   whiff_pct      — swinging strike % across all pitches
--   csw_pct        — (called + swinging) % across all pitches
--   strikeouts     — total strikeout-event count

create table public.pitch_rankings (
  category text not null check (category in (
    'velo_ff',
    'spin_ff',
    'vaa_flat_ff',
    'whiff_pct',
    'csw_pct',
    'strikeouts'
  )),
  season integer not null,
  rank smallint not null check (rank between 1 and 5),
  pitcher_id bigint not null references public.pitch_pitchers(mlb_id) on delete cascade,
  value numeric not null,
  pitches_sampled integer not null,
  computed_at timestamptz not null default now(),
  primary key (category, season, rank)
);

create index pitch_rankings_season_idx
  on public.pitch_rankings (season, category, rank);

alter table public.pitch_rankings enable row level security;

create policy "pitch_rankings: public read"
  on public.pitch_rankings
  for select
  to anon, authenticated
  using (true);
