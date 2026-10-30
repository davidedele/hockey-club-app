-- The attendance summary can be limited to one group and to one kind of event, and tells each
-- person's position so the page can filter by role. Finished events that were not cancelled only.

drop function public.attendance_summary(timestamptz, timestamptz);

create function public.attendance_summary(
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
  group by p.id, p.first_name, p.last_name, p.position
  order by p.last_name, p.first_name;
end
$$;

revoke all on function public.attendance_summary(timestamptz, timestamptz, smallint, public.event_type)
  from public, anon, authenticated;
grant execute on function public.attendance_summary(timestamptz, timestamptz, smallint, public.event_type)
  to authenticated;
