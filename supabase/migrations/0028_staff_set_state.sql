-- Staff change what a person is for an event: present, absent, waiting (no answer) or not called up.
-- It changes the person's own answer, so the counts and the reminders follow it.

create function public.set_player_state(p_event_id uuid, p_user_id uuid, p_state text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cancelled timestamptz;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_state is null or p_state not in ('present', 'absent', 'waiting', 'not_called_up') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  select cancelled_at into v_cancelled from public.events where id = p_event_id;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_cancelled is not null then
    raise exception 'event_cancelled' using errcode = 'P0001';
  end if;
  -- Only people of the groups the event is shown to.
  if not exists (
    select 1 from public.event_groups eg
    join public.group_members gm on gm.group_id = eg.group_id
    where eg.event_id = p_event_id and gm.user_id = p_user_id
  ) then
    raise exception 'not_in_event' using errcode = 'P0001';
  end if;

  if p_state = 'not_called_up' then
    insert into public.attendance_records (event_id, user_id, status)
    values (p_event_id, p_user_id, 'not_called_up')
    on conflict (event_id, user_id) do update set status = 'not_called_up';
    return;
  end if;

  -- Back among the people called up. Any other recorded status stays as it is.
  delete from public.attendance_records
  where event_id = p_event_id and user_id = p_user_id and status = 'not_called_up';

  if p_state = 'waiting' then
    delete from public.attendance_answers where event_id = p_event_id and user_id = p_user_id;
  else
    insert into public.attendance_answers (event_id, user_id, answer)
    values (p_event_id, p_user_id, p_state::public.attendance_answer)
    on conflict (event_id, user_id)
    do update set answer = excluded.answer, answered_at = now(), from_period = null;
  end if;
end
$$;

revoke all on function public.set_player_state(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_player_state(uuid, uuid, text) to authenticated;
