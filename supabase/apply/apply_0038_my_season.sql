-- Apply migration 0038 (my_season) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0038 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regclass('public.game_ratings') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rinks' and column_name = 'address')) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0038 was not applied.';
  end if;
  if to_regprocedure('public.my_season(integer)') is not null then
    raise exception 'Migration 0038 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- "La mia stagione": the signed in person's own numbers for one season, and nobody else's.
--
-- Attendance counts the same events as the staff summary (attendance_summary): not cancelled, already
-- over, in a group of the person, from 1 September to 31 August. Games, goals, assists, penalty
-- minutes and MVP votes come from season_player_stats, the function behind the Statistiche page, so the
-- numbers cannot disagree. The average rating is over the games the person voted on only: ratings are
-- shown to someone who played only after they have voted (decision of 21 October).

create function public.my_season(p_season integer)
returns table (
  events_total bigint,
  answered_present bigint,
  answered_absent bigint,
  no_answer bigint,
  on_time bigint,
  late bigint,
  excused bigint,
  unexcused bigint,
  injured bigint,
  not_called_up bigint,
  games integer,
  goals integer,
  assists integer,
  penalty_minutes integer,
  mvp integer,
  rating_avg numeric,
  rated_games integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not public.is_member() or p_season not between 2000 and 2100 then
    return;
  end if;
  return query
  with pairs as (
    select distinct e.id as event_id
    from public.events e
    join public.event_groups eg on eg.event_id = e.id
    join public.group_members gm on gm.group_id = eg.group_id and gm.user_id = v_me
    where e.cancelled_at is null
      and e.ends_at <= now()
      and e.starts_at >= make_timestamptz(p_season, 9, 1, 0, 0, 0, 'Europe/Rome')
      and e.starts_at < make_timestamptz(p_season + 1, 9, 1, 0, 0, 0, 'Europe/Rome')
  ),
  att as (
    select
      count(*)::bigint as total,
      (count(*) filter (where a.answer = 'present' and r.status is distinct from 'not_called_up'))::bigint as ap,
      (count(*) filter (where a.answer = 'absent' and r.status is distinct from 'not_called_up'))::bigint as aa,
      (count(*) filter (where a.answer is null and r.status is distinct from 'not_called_up'))::bigint as na,
      (count(*) filter (where r.status = 'on_time'))::bigint as ot,
      (count(*) filter (where r.status = 'late'))::bigint as lt,
      (count(*) filter (where r.status = 'excused'))::bigint as ex,
      (count(*) filter (where r.status = 'unexcused'))::bigint as ux,
      (count(*) filter (where r.status = 'injured'))::bigint as inj,
      (count(*) filter (where r.status = 'not_called_up'))::bigint as nc
    from pairs
    left join public.attendance_answers a on a.event_id = pairs.event_id and a.user_id = v_me
    left join public.attendance_records r on r.event_id = pairs.event_id and r.user_id = v_me
  ),
  mine as (
    select s.games, s.goals, s.assists, s.penalty_minutes, s.mvp
    from public.season_player_stats(p_season, null) s where s.user_id = v_me
  ),
  rated as (
    select round(avg(g.rating), 1) as avg, count(distinct g.event_id)::integer as n
    from public.game_ratings g
    where g.rated_id = v_me
      and g.event_id in (select public.season_games(p_season, null))
      and exists (select 1 from public.mvp_votes v where v.event_id = g.event_id and v.voter_id = v_me)
  )
  select att.total, att.ap, att.aa, att.na, att.ot, att.lt, att.ex, att.ux, att.inj, att.nc,
         coalesce(m.games, 0), coalesce(m.goals, 0), coalesce(m.assists, 0), coalesce(m.penalty_minutes, 0), coalesce(m.mvp, 0),
         rated.avg, rated.n
  from att left join mine m on true cross join rated;
end
$$;

revoke all on function public.my_season(integer) from public, anon, authenticated;
grant execute on function public.my_season(integer) to authenticated;

commit;
