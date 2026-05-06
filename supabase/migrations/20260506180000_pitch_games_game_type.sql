-- Add game_type to pitch_games and prune existing spring-training data.
--
-- game_type follows MLB Stats API / Savant codes:
--   R = Regular Season         S = Spring Training      E = Exhibition
--   F = Wild Card              D = Division Series      L = LCS
--   W = World Series           A = All-Star
--
-- For existing rows we don't have game_type recorded, so heuristic-mark
-- pre-March-20 of each season as Spring Training and the rest as
-- Regular Season. The heuristic mis-classifies late spring games
-- (e.g. 2026-03-21 was preseason but >= 2026-03-20). For accurate
-- backfill, follow this migration with a one-shot pass that reads
-- gameType from MLB Stats API:
--   for year in 2024..currentSeason
--   curl https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=$year&gameType=S
--   UPDATE pitch_games SET game_type='S' WHERE game_pk IN (...)
-- Future inserts set this column accurately from Savant's CSV /
-- MLB Stats API gameType fields, so the heuristic only matters for
-- the initial one-time seed.

alter table public.pitch_games add column game_type text;

update public.pitch_games
set game_type = case
  when game_date < (season::text || '-03-20')::date then 'S'
  else 'R'
end;

create index pitch_games_game_type_idx on public.pitch_games (game_type);

-- Drop everything tied to spring-training games. The dropdown only
-- ever surfaces regular-season meeting going forward; keeping these
-- rows around just bloats the cache.
delete from public.pitch_pitcher_games ppg
using public.pitch_games g
where ppg.game_pk = g.game_pk
  and g.game_type <> 'R';

delete from public.pitch_game_pitches pgp
using public.pitch_games g
where pgp.game_pk = g.game_pk
  and g.game_type <> 'R';

-- Keep pitch_games rows around (the schedule cron repopulates them)
-- but recompute aggregates so the arsenal numbers reflect only
-- regular-season pitches.
select public.pitch_recompute_aggregates();
