-- The list of people without an answer can end at a given time instead of a number of days from now. The Home card
-- and the attendance tab use it to count the calendar week (decision 92), the same window as the banner, the bell and
-- the Eventi heading. Without p_until nothing changes: the window is p_days from now.

drop function public.unanswered_people(integer);

create function public.unanswered_people(p_days integer default 7, p_until timestamptz default null)
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
    where e.cancelled_at is null
      and e.ends_at > now()
      and e.starts_at < coalesce(p_until, now() + make_interval(days => greatest(p_days, 0)))
  )
  select p.id, p.first_name, p.last_name, c.email, c.phone, count(*)::bigint
  from pairs
  join public.profiles p on p.id = pairs.person_id
  join public.profile_contacts c on c.user_id = p.id
  where not exists (
    select 1 from public.attendance_answers a
    where a.event_id = pairs.event_id and a.user_id = pairs.person_id
  )
  and not exists (
    select 1 from public.attendance_records r
    where r.event_id = pairs.event_id and r.user_id = pairs.person_id and r.status = 'not_called_up'
  )
  group by p.id, p.first_name, p.last_name, c.email, c.phone
  order by count(*) desc, p.last_name, p.first_name;
end
$$;

revoke all on function public.unanswered_people(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.unanswered_people(integer, timestamptz) to authenticated;
