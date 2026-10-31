-- After an event has ended, "present" means the people the staff recorded as on time or late.
-- Before the event has ended, and when the staff have not recorded anyone yet, it means the people who
-- answered present. A person marked not called up is never present, in either case (see 0033).
-- Until now the lists and counters only ever followed the answers, so a finished game could show
-- "Presenti (0)" although the staff had recorded who came.

-- True when the event is over and the staff recorded at least one real status for it. A status of
-- not called up is a decision about the call up, not a record of who came, so it does not count.
create function public.event_presence_recorded(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_see_event(p_event_id)
    and exists (select 1 from public.events e where e.id = p_event_id and e.ends_at <= now())
    and exists (
      select 1 from public.attendance_records r
      where r.event_id = p_event_id and r.status <> 'not_called_up'
    )
$$;

create or replace function public.event_present_counts(p_event_ids uuid[])
returns table (event_id uuid, present bigint)
language sql stable security definer set search_path = '' as $$
  select e.id,
    case when public.event_presence_recorded(e.id) then
      (select count(*) from public.attendance_records r where r.event_id = e.id and r.status in ('on_time', 'late'))
    else
      (select count(*) from public.attendance_answers a
        where a.event_id = e.id and a.answer = 'present'
          and not exists (
            select 1 from public.attendance_records r
            where r.event_id = e.id and r.user_id = a.user_id and r.status = 'not_called_up'
          ))
    end::bigint
  from public.events e
  where e.id = any(p_event_ids)
    and public.can_see_event(e.id)
$$;

create or replace function public.event_present_people(p_event_id uuid)
returns table (user_id uuid, first_name text, last_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.last_name
  from public.profiles p
  where public.can_see_event(p_event_id)
    and case when public.event_presence_recorded(p_event_id) then
      exists (select 1 from public.attendance_records r where r.event_id = p_event_id and r.user_id = p.id and r.status in ('on_time', 'late'))
    else
      exists (select 1 from public.attendance_answers a where a.event_id = p_event_id and a.user_id = p.id and a.answer = 'present')
      and not exists (select 1 from public.attendance_records r where r.event_id = p_event_id and r.user_id = p.id and r.status = 'not_called_up')
    end
  order by p.last_name, p.first_name
$$;

revoke all on function public.event_presence_recorded(uuid) from public, anon, authenticated;
grant execute on function public.event_presence_recorded(uuid) to authenticated;
