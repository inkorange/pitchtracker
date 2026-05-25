-- The cron jobs that call these functions over the service_role have
-- been 500-ing for two weeks. Postgres aborts the call once the role's
-- default statement_timeout fires; the cron route surfaces it as a 500
-- and the homepage rankings + aggregates table fall out of date.
--
-- Bump the per-function statement_timeout to give the cron real
-- headroom. All three are bounded — they walk the cached pitch table
-- once and exit — but their wall-clock time grows with the season.

alter function public.pitch_recompute_aggregates() set statement_timeout = '180s';
alter function public.pitch_recompute_rankings(int) set statement_timeout = '180s';
alter function public.pitch_evict_old_seasons(int) set statement_timeout = '180s';
