-- Fuzzy player search. Combines exact ilike match with dmetaphone
-- phonetic match so speech-to-text spellings like "McClain" still
-- resolve to "McLean", and typos like "Skenez" still resolve to "Skenes".
--
-- Ranking: exact substring matches come first (they're what the user
-- explicitly typed). Phonetic-only matches fall through afterward,
-- ordered by recency (last_active_year). Combined limit applied at the
-- end so we don't blow past the AI tool's 10-row budget.

create extension if not exists fuzzystrmatch;

-- Functional indexes so phonetic lookups don't full-scan the table.
-- dmetaphone returns a 4-char code; the equality check on it is the
-- fast path. text_pattern_ops accelerates ILIKE prefixes but ILIKE '%x%'
-- still scans — acceptable given pitch_pitchers / pitch_batters are
-- ~1500 rows each.
create index if not exists pitch_pitchers_dmetaphone_last_idx
  on public.pitch_pitchers (dmetaphone(coalesce(last_name, '')));
create index if not exists pitch_pitchers_dmetaphone_full_idx
  on public.pitch_pitchers (dmetaphone(coalesce(full_name, '')));
create index if not exists pitch_batters_dmetaphone_last_idx
  on public.pitch_batters (dmetaphone(coalesce(last_name, '')));
create index if not exists pitch_batters_dmetaphone_full_idx
  on public.pitch_batters (dmetaphone(coalesce(full_name, '')));

create or replace function public.pitch_search_pitchers(
  p_query text,
  p_limit int default 10
)
returns table(
  mlb_id bigint,
  full_name text,
  throws char,
  current_team_id bigint,
  debut_year int,
  last_active_year int,
  match_kind text
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select trim(p_query) as raw,
           '%' || trim(p_query) || '%' as pat,
           dmetaphone(trim(p_query)) as dm
  )
  select
    p.mlb_id,
    p.full_name,
    p.throws,
    p.current_team_id,
    p.debut_year,
    p.last_active_year,
    case
      when p.full_name ilike (select pat from q)
        or p.last_name ilike (select pat from q)
        then 'exact'
      else 'phonetic'
    end as match_kind
  from pitch_pitchers p
  where p.full_name ilike (select pat from q)
     or p.last_name ilike (select pat from q)
     or dmetaphone(coalesce(p.last_name, '')) = (select dm from q)
     or dmetaphone(coalesce(p.full_name, '')) = (select dm from q)
  order by
    case
      when p.full_name ilike (select pat from q)
        or p.last_name ilike (select pat from q)
        then 0
      else 1
    end,
    p.last_active_year desc nulls last
  limit greatest(p_limit, 1);
$$;

create or replace function public.pitch_search_batters(
  p_query text,
  p_limit int default 10
)
returns table(
  mlb_id bigint,
  full_name text,
  bats char,
  current_team_id bigint,
  debut_year int,
  last_active_year int,
  match_kind text
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select trim(p_query) as raw,
           '%' || trim(p_query) || '%' as pat,
           dmetaphone(trim(p_query)) as dm
  )
  select
    b.mlb_id,
    b.full_name,
    b.bats,
    b.current_team_id,
    b.debut_year,
    b.last_active_year,
    case
      when b.full_name ilike (select pat from q)
        or b.last_name ilike (select pat from q)
        then 'exact'
      else 'phonetic'
    end as match_kind
  from pitch_batters b
  where b.full_name ilike (select pat from q)
     or b.last_name ilike (select pat from q)
     or dmetaphone(coalesce(b.last_name, '')) = (select dm from q)
     or dmetaphone(coalesce(b.full_name, '')) = (select dm from q)
  order by
    case
      when b.full_name ilike (select pat from q)
        or b.last_name ilike (select pat from q)
        then 0
      else 1
    end,
    b.last_active_year desc nulls last
  limit greatest(p_limit, 1);
$$;

grant execute on function public.pitch_search_pitchers(text, int) to anon, authenticated, service_role;
grant execute on function public.pitch_search_batters(text, int) to anon, authenticated, service_role;
