-- Drop columns parsed from Savant + stored but never read for any
-- feature (audited via grep across the entire src/ tree, excluding
-- the per-route pass-through layers). Trims the row footprint on
-- pitch_game_pitches.
--
-- Postgres DROP COLUMN is instant (catalog-only); physical disk
-- space is reclaimed on a subsequent VACUUM FULL or pg_repack run,
-- which we schedule manually post-deploy in a low-traffic window.

alter table public.pitch_game_pitches
  drop column if exists effective_speed,
  drop column if exists delta_home_win_exp,
  drop column if exists pitch_name,
  drop column if exists p_throws;
