-- pitch_top_strikeouts does a full table scan of pitch_game_pitches
-- filtered to events in ('strikeout','strikeout_double_play'), which
-- comfortably blows past the anon role's default 8s statement_timeout
-- when called directly from the /strikeout_leaders page render.
--
-- Mirrors the per-function timeout overrides set in
-- 20260525_pitch_cron_statement_timeouts.sql.

alter function public.pitch_top_strikeouts(int, int)
  set statement_timeout = '30s';
