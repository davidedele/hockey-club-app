-- Lists for coaches and the board: who has not answered, and the attendance summary per player.
-- Both are read only functions for staff. A person in two groups of one event counts once.

-- People with no answer for events starting within the next p_days days, with their contacts.
create function public.unanswered_people(p_days integer default 7)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  missing bigint
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
    where e.ends_at > now()
      and e.starts_at < now() + make_interval(days => greatest(p_days, 0))
  )
  select p.id, p.first_name, p.last_name, c.email, c.phone, count(*)::bigint
  from pairs
  join public.profiles p on p.id = pairs.person_id
  join public.profile_contacts c on c.user_id = p.id
  where not exists (
    select 1 from public.attendance_answers a
    where a.event_id = pairs.event_id and a.user_id = pairs.person_id
  )
  group by p.id, p.first_name, p.last_name, c.email, c.phone
  order by count(*) desc, p.last_name, p.first_name;
end
$$;

-- Per player, over finished events shown to their groups: answers and recorded attendance.
create function public.attendance_summary(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
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
    where e.ends_at <= now()
      and (p_from is null or e.starts_at >= p_from)
      and (p_to is null or e.starts_at < p_to)
  )
  select p.id, p.first_name, p.last_name,
    count(*)::bigint,
    (count(*) filter (where a.answer = 'present'))::bigint,
    (count(*) filter (where a.answer = 'absent'))::bigint,
    (count(*) filter (where a.answer is null))::bigint,
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
  group by p.id, p.first_name, p.last_name
  order by p.last_name, p.first_name;
end
$$;

revoke all on function public.unanswered_people(integer),
  public.attendance_summary(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.unanswered_people(integer),
  public.attendance_summary(timestamptz, timestamptz) to authenticated;
