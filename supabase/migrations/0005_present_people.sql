-- Who said present for an event, by name. Players see this for events of their groups, as in SportEasy.
-- Absent answers and recorded attendance stay visible to staff only.
create function public.event_present_people(p_event_id uuid)
returns table (user_id uuid, first_name text, last_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.last_name
  from public.attendance_answers a
  join public.profiles p on p.id = a.user_id
  where a.event_id = p_event_id
    and a.answer = 'present'
    and public.can_see_event(p_event_id)
  order by p.last_name, p.first_name
$$;

revoke all on function public.event_present_people(uuid) from public, anon, authenticated;
grant execute on function public.event_present_people(uuid) to authenticated;
