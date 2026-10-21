-- How many people said present, per event. Shown on the events home, as SportEasy does.
-- Only the number is returned, never who answered, and only for events the caller can see.
create function public.event_present_counts(p_event_ids uuid[])
returns table (event_id uuid, present bigint)
language sql stable security definer set search_path = '' as $$
  select e.id, count(a.user_id)::bigint
  from public.events e
  left join public.attendance_answers a on a.event_id = e.id and a.answer = 'present'
  where e.id = any(p_event_ids)
    and public.can_see_event(e.id)
  group by e.id
$$;

revoke all on function public.event_present_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.event_present_counts(uuid[]) to authenticated;
