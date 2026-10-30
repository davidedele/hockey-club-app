-- People that staff marked as not called up for an event are not waited for: no reminder email,
-- and they do not show among the people who have not answered. The app counts follow the same rule.

create or replace function public.reminders_due(p_now timestamptz default now())
returns table (
  user_id uuid,
  email text,
  first_name text,
  kind text,
  event_id uuid,
  title text,
  type public.event_type,
  starts_at timestamptz,
  venue text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hour integer := extract(hour from p_now at time zone 'Europe/Rome');
begin
  if v_hour < 8 or v_hour >= 22 then
    return;
  end if;
  return query
  with pairs as (
    select distinct e.id as eid, gm.user_id as uid,
      case when e.starts_at <= p_now + interval '1 day' then 'last' else 'first' end as k
    from public.events e
    join public.event_groups eg on eg.event_id = e.id
    join public.group_members gm on gm.group_id = eg.group_id
    where e.cancelled_at is null
      and e.starts_at > p_now
      and e.starts_at <= p_now + interval '3 days'
  )
  select p.uid, c.email, pr.first_name, p.k, e.id, e.title, e.type, e.starts_at, e.venue
  from pairs p
  join public.events e on e.id = p.eid
  join public.profiles pr on pr.id = p.uid
  join public.profile_contacts c on c.user_id = p.uid
  where not exists (select 1 from public.attendance_answers a where a.event_id = p.eid and a.user_id = p.uid)
    and not exists (select 1 from public.attendance_records r where r.event_id = p.eid and r.user_id = p.uid and r.status = 'not_called_up')
    and not exists (select 1 from public.reminder_prefs rp where rp.user_id = p.uid and not rp.enabled)
    and not exists (select 1 from public.reminder_log l where l.event_id = p.eid and l.user_id = p.uid and (l.kind = p.k or l.kind = 'last'))
  order by p.uid, e.starts_at;
end
$$;

create or replace function public.unanswered_people(p_days integer default 7)
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
  and not exists (
    select 1 from public.attendance_records r
    where r.event_id = pairs.event_id and r.user_id = pairs.person_id and r.status = 'not_called_up'
  )
  group by p.id, p.first_name, p.last_name, c.email, c.phone
  order by count(*) desc, p.last_name, p.first_name;
end
$$;
