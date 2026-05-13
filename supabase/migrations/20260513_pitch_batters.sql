-- pitch_batters: ~1500 active and recently-active MLB position players.
-- Mirrors pitch_pitchers but stores `bats` (L/R/S) instead of `throws`.
-- Used by the AI chat layer's batter name → mlb_id resolution; we need
-- this index so requests like "Skenes vs Lindor" can be translated
-- without round-tripping the MLB Stats API for every query.
--
-- Two-way players (position code "Y") live in both pitch_pitchers and
-- pitch_batters — Ohtani would appear in either resolver.

create table if not exists public.pitch_batters (
  mlb_id              bigint primary key,
  full_name           text not null,
  first_name          text,
  last_name           text,
  bats                char(1),
  current_team_id     bigint references public.pitch_teams(mlb_id) on delete set null,
  debut_year          int,
  last_active_year    int,
  updated_at          timestamptz not null default now()
);
create index if not exists pitch_batters_full_name_idx on public.pitch_batters (full_name);
create index if not exists pitch_batters_last_name_idx on public.pitch_batters (last_name);
create index if not exists pitch_batters_current_team_idx on public.pitch_batters (current_team_id);
alter table public.pitch_batters enable row level security;
create policy "pitch_batters: public read"
  on public.pitch_batters for select to anon, authenticated using (true);
