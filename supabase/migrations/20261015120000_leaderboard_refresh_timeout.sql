-- Give pitch_refresh_leaderboards() a statement_timeout long enough to
-- actually finish.
--
-- Bug: this function has been failing on every single invocation since
-- it shipped in 20260811_pitch_leaderboard_caching.sql, and the failure
-- was invisible.
--
-- Why it failed: PostgREST connects as `authenticator`, which carries
-- `statement_timeout=8s`, and `service_role` sets no override of its
-- own — so an RPC called with the service key still inherits the 8s
-- cap. `REFRESH MATERIALIZED VIEW CONCURRENTLY` over the ~196 MB
-- pitch_game_pitches heap cannot complete in 8s, so both refreshes
-- aborted every time.
--
-- Why nobody noticed: the caller treats this as best-effort and only
-- logs (`console.error` in api/cron/refresh-rankings), by design, so a
-- failed refresh keeps serving the previous snapshot. With every
-- refresh failing, "the previous snapshot" has been the one written by
-- CREATE MATERIALIZED VIEW at migration time. Detected on 2026-10-15:
-- pitch_top_velocity_7d held 417 rows while its own predicate
-- (game_date > current_date - 7, game_type = 'R') yields 0, the regular
-- season having ended on 2026-09-27.
--
-- 180s matches pitch_evict_old_seasons, the other heavy cron-only RPC
-- in this schema, which sets the same value for the same reason.
--
-- Note the consequence of fixing this: once the refresh succeeds,
-- pitch_top_velocity_7d legitimately empties out between seasons,
-- because a 7-day window contains no games. That is correct, and the
-- offseason handling for it belongs in the application layer, not in a
-- deliberately stale view.

create or replace function public.pitch_refresh_leaderboards()
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '180s'
as $function$
begin
  refresh materialized view concurrently public.pitch_top_velocity_7d;
  refresh materialized view concurrently public.pitch_top_strikeouts_current;
end;
$function$;
