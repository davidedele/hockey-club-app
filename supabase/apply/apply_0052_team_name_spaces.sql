-- Apply migration 0052 (team_name_spaces) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0052 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regprocedure('public.opponent_history(uuid)') is not null) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0052 was not applied.';
  end if;
  if to_regprocedure('public.team_key(text)') is not null then
    raise exception 'Migration 0052 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Opponent history: names are now compared without case, without spaces at the ends and with any run of
-- spaces inside a name counted as one ("HC  Fanano" is "hc fanano"). Only the comparison changes; the stored
-- names, the result of the function and who may call it stay as they were (migration 0043).

create function public.team_key(p_name text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'))
$$;
-- Used only inside the functions that compare names; nobody calls it directly.
revoke all on function public.team_key(text) from public, anon, authenticated;

create or replace function public.opponent_history(p_event_id uuid)
returns table (
  starts_at timestamptz,
  home_away text,
  score_for smallint,
  score_against smallint,
  source text
)
language sql stable security definer set search_path = '' as $$
  with me as (
    select e.id, public.team_key(e.opponent) as opp, e.starts_at
    from public.events e
    where e.id = p_event_id and e.type = 'game' and e.opponent is not null and public.is_member()
  ),
  ours as (
    select public.team_key(g.league_team) as team from public.groups g where g.league_team is not null
  ),
  club as (
    select e.starts_at, e.home_away, e.score_for, e.score_against, 'club'::text as source
    from public.events e, me
    where e.type = 'game' and e.id <> me.id and public.team_key(e.opponent) = me.opp
      and e.score_for is not null and e.cancelled_at is null and e.starts_at < now()
  ),
  league as (
    select lm.starts_at,
           case when public.team_key(lm.home) = me.opp then 'away' else 'home' end as home_away,
           (case when public.team_key(lm.home) = me.opp then lm.away_score else lm.home_score end) as score_for,
           (case when public.team_key(lm.home) = me.opp then lm.home_score else lm.away_score end) as score_against,
           'league'::text as source
    from public.league_matches lm, me
    where lm.home_score is not null and lm.starts_at < now()
      and not exists (select 1 from public.events x where x.league_match_id = lm.id)
      and ((public.team_key(lm.home) = me.opp and public.team_key(lm.away) in (select team from ours))
        or (public.team_key(lm.away) = me.opp and public.team_key(lm.home) in (select team from ours)))
  )
  select * from (select * from club union all select * from league) h
  order by h.starts_at desc
  limit 5
$$;

commit;
