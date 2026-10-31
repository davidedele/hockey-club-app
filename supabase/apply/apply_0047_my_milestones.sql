-- Apply migration 0047 (my_milestones) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0047 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'announcements' and column_name = 'pinned_at')) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0047 was not applied.';
  end if;
  if to_regprocedure('public.my_milestones()') is not null then
    raise exception 'Migration 0047 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Milestones (V6): automatic recognitions for the signed in person, computed from data that already
-- exists, and nobody else's. One row per milestone reached: the kind, the level and the day it was
-- reached.
--   goals     1 (the first goal), 10, 25, 50, 100       from the game numbers
--   assists   1, 10, 25, 50
--   games     1, 10, 25, 50                              games the person was recorded at, on time or late
--   trainings 10, 25, 50, 100                            trainings the person was recorded at
--   streak    10, 20                                     trainings in a row, counting the ones the person was called to
-- Cancelled and unfinished events do not count. Everything is over all seasons.

create function public.my_milestones()
returns table (kind text, level integer, reached_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not public.is_member() then
    return;
  end if;
  return query
  with mine as (
    select distinct e.id, e.type, e.starts_at
    from public.events e
    join public.event_groups eg on eg.event_id = e.id
    join public.group_members gm on gm.group_id = eg.group_id and gm.user_id = v_me
    where e.cancelled_at is null and e.ends_at <= now()
  ),
  called as (
    select m.id, m.type, m.starts_at, coalesce(r.status in ('on_time', 'late'), false) as attended
    from mine m
    left join public.attendance_records r on r.event_id = m.id and r.user_id = v_me
    where r.status is distinct from 'not_called_up'
  ),
  runs as (
    select c.*, sum(case when c.attended then 0 else 1 end) over (order by c.starts_at, c.id) as run
    from called c where c.type = 'training'
  ),
  series as (
    select 'goals'::text as kind, e.starts_at, (sum(gs.goals) over (order by e.starts_at, e.id))::bigint as cum
      from public.game_stats gs join public.events e on e.id = gs.event_id
      where gs.user_id = v_me and e.cancelled_at is null and e.ends_at <= now()
    union all
    select 'assists', e.starts_at, (sum(gs.assists) over (order by e.starts_at, e.id))::bigint
      from public.game_stats gs join public.events e on e.id = gs.event_id
      where gs.user_id = v_me and e.cancelled_at is null and e.ends_at <= now()
    union all
    select 'games', c.starts_at, (count(*) over (order by c.starts_at, c.id))::bigint
      from called c where c.type = 'game' and c.attended
    union all
    select 'trainings', c.starts_at, (count(*) over (order by c.starts_at, c.id))::bigint
      from called c where c.type = 'training' and c.attended
    union all
    select 'streak', r.starts_at, (count(*) over (partition by r.run order by r.starts_at, r.id))::bigint
      from runs r where r.attended
  ),
  levels (kind, level) as (
    values ('goals', 1), ('goals', 10), ('goals', 25), ('goals', 50), ('goals', 100),
           ('assists', 1), ('assists', 10), ('assists', 25), ('assists', 50),
           ('games', 1), ('games', 10), ('games', 25), ('games', 50),
           ('trainings', 10), ('trainings', 25), ('trainings', 50), ('trainings', 100),
           ('streak', 10), ('streak', 20)
  )
  select l.kind, l.level, min(s.starts_at)
  from levels l join series s on s.kind = l.kind and s.cum >= l.level
  group by l.kind, l.level
  order by min(s.starts_at) desc, l.kind, l.level desc;
end
$$;

revoke all on function public.my_milestones() from public, anon, authenticated;
grant execute on function public.my_milestones() to authenticated;

commit;
