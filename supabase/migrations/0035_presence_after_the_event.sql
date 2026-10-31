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

-- An event lasts at most 12 hours, as the event form already says. The check is added as "not valid":
-- rows that already exist are not tested, so the migration cannot fail on old data, but every new
-- event and every changed event is. To find old rows that break it, run
--   select id, title, starts_at, ends_at from public.events where ends_at > starts_at + interval '12 hours';
-- and after correcting them
--   alter table public.events validate constraint events_duration_max;
alter table public.events
  add constraint events_duration_max check (ends_at <= starts_at + interval '12 hours') not valid;

-- A phone number is made of digits, with an optional + in front and spaces, dots, dashes, slashes
-- or brackets between them, and has between 6 and 17 digits (decision 30: Italian mobile numbers,
-- landlines and foreign numbers). Empty stays allowed. Not valid for the same reason as above:
--   select user_id, phone from public.profile_contacts where phone <> '' and not (phone ~ '^[+]?[0-9][0-9 ()./-]*$' and length(regexp_replace(phone, '[^0-9]', '', 'g')) between 6 and 17);
--   alter table public.profile_contacts validate constraint profile_contacts_phone_format;
alter table public.profile_contacts
  add constraint profile_contacts_phone_format check (
    phone is null or phone = ''
    or (phone ~ '^[+]?[0-9][0-9 ()./-]*$' and length(regexp_replace(phone, '[^0-9]', '', 'g')) between 6 and 17)
  ) not valid;
