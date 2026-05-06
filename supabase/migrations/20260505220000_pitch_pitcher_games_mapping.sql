-- Mapping table for "which games did this pitcher appear in".
--
-- Why: prior to this, the page derived a pitcher's games-of-record by
-- selecting game_pk from pitch_game_pitches with no season filter. That
-- query silently truncates at PostgREST's 1000-row default cap, so any
-- pitcher with cached pitches across multiple seasons (e.g. Skenes ~8000
-- rows across 2024-26) loses entire seasons from the dropdown.
--
-- This table is populated as a side effect of backfill (one row per
-- pitcher per appearance) so the dropdown can be queried directly,
-- bounded by games-per-pitcher (~30-80/season) instead of pitches.

create table public.pitch_pitcher_games (
  pitcher_id bigint not null references public.pitch_pitchers(mlb_id) on delete cascade,
  game_pk bigint not null references public.pitch_games(game_pk) on delete cascade,
  fetched_at timestamptz not null default now(),
  primary key (pitcher_id, game_pk)
);

-- Lookup pattern is "all games for this pitcher" → primary-key prefix
-- already covers it. Add a secondary index by game_pk only if the
-- reverse direction ("who pitched in this game") becomes load-bearing.

alter table public.pitch_pitcher_games enable row level security;

create policy "pitch_pitcher_games: public read"
  on public.pitch_pitcher_games
  for select
  to anon, authenticated
  using (true);

-- Backfill from existing data so the table is immediately useful for
-- already-cached pitchers.
insert into public.pitch_pitcher_games (pitcher_id, game_pk)
select distinct pitcher_id, game_pk
from public.pitch_game_pitches
where pitcher_id is not null
on conflict do nothing;
