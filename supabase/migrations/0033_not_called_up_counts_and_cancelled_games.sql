-- People that staff marked as not called up for an event do not count as present, are not offered for
-- the line-up and are not counted as having failed to answer. Cancelled games are not season games.

create or replace function public.event_present_counts(p_event_ids uuid[])
returns table (event_id uuid, present bigint)
language sql stable security definer set search_path = '' as $$
  select e.id, count(a.user_id)::bigint
  from public.events e
  left join public.attendance_answers a on a.event_id = e.id and a.answer = 'present'
    and not exists (
      select 1 from public.attendance_records r
      where r.event_id = e.id and r.user_id = a.user_id and r.status = 'not_called_up'
    )
  where e.id = any(p_event_ids)
    and public.can_see_event(e.id)
  group by e.id
$$;

create or replace function public.event_present_people(p_event_id uuid)
returns table (user_id uuid, first_name text, last_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.last_name
  from public.attendance_answers a
  join public.profiles p on p.id = a.user_id
  where a.event_id = p_event_id
    and a.answer = 'present'
    and not exists (
      select 1 from public.attendance_records r
      where r.event_id = p_event_id and r.user_id = a.user_id and r.status = 'not_called_up'
    )
    and public.can_see_event(p_event_id)
  order by p.last_name, p.first_name
$$;

create or replace function public.lineup_candidates(p_event_id uuid)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  jersey_number smallint,
  "position" text,
  answer public.attendance_answer
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.last_name, p.jersey_number, p.position, a.answer
  from public.profiles p
  left join public.attendance_answers a on a.event_id = p_event_id and a.user_id = p.id
  where public.is_staff()
    and exists (
      select 1 from public.group_members gm
      join public.event_groups eg on eg.group_id = gm.group_id and eg.event_id = p_event_id
      where gm.user_id = p.id
    )
    and not exists (
      select 1 from public.attendance_records r
      where r.event_id = p_event_id and r.user_id = p.id and r.status = 'not_called_up'
    )
  order by p.last_name, p.first_name
$$;

create or replace function public.season_games(p_season integer, p_group_id smallint)
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select e.id from public.events e
  where e.type = 'game'
    and e.cancelled_at is null
    and p_season between 2000 and 2100
    and e.starts_at >= make_timestamptz(p_season, 9, 1, 0, 0, 0, 'Europe/Rome')
    and e.starts_at < make_timestamptz(p_season + 1, 9, 1, 0, 0, 0, 'Europe/Rome')
    and e.starts_at <= now()
    and (p_group_id is null or exists (
      select 1 from public.event_groups eg where eg.event_id = e.id and eg.group_id = p_group_id))
$$;

-- In the summary, an event someone was not called up for is neither an answer nor a missing answer.
-- The number of events and the not called up count stay as they were.
create or replace function public.attendance_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_group_id smallint default null,
  p_type public.event_type default null
)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  "position" text,
  events_total bigint,
  answered_present bigint,
  answered_absent bigint,
  no_answer bigint,
  on_time bigint,
  late bigint,
  excused bigint,
  unexcused bigint,
  injured bigint,
  not_called_up bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with pairs as (
    select distinct e.id as event_id, gm.user_id as person_id
    from public.events e
    join public.event_groups eg on eg.event_id = e.id
    join public.group_members gm on gm.group_id = eg.group_id
    where e.cancelled_at is null
      and e.ends_at <= now()
      and (p_from is null or e.starts_at >= p_from)
      and (p_to is null or e.starts_at < p_to)
      and (p_group_id is null or eg.group_id = p_group_id)
      and (p_type is null or e.type = p_type)
  )
  select p.id, p.first_name, p.last_name, p.position,
    count(*)::bigint,
    (count(*) filter (where a.answer = 'present' and r.status is distinct from 'not_called_up'))::bigint,
    (count(*) filter (where a.answer = 'absent' and r.status is distinct from 'not_called_up'))::bigint,
    (count(*) filter (where a.answer is null and r.status is distinct from 'not_called_up'))::bigint,
    (count(*) filter (where r.status = 'on_time'))::bigint,
    (count(*) filter (where r.status = 'late'))::bigint,
    (count(*) filter (where r.status = 'excused'))::bigint,
    (count(*) filter (where r.status = 'unexcused'))::bigint,
    (count(*) filter (where r.status = 'injured'))::bigint,
    (count(*) filter (where r.status = 'not_called_up'))::bigint
  from pairs
  join public.profiles p on p.id = pairs.person_id
  left join public.attendance_answers a on a.event_id = pairs.event_id and a.user_id = pairs.person_id
  left join public.attendance_records r on r.event_id = pairs.event_id and r.user_id = pairs.person_id
  group by p.id, p.first_name, p.last_name, p.position
  order by p.last_name, p.first_name;
end
$$;
