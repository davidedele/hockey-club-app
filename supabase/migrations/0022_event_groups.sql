-- Change the groups an event is shown to, for one event or for it and the later ones of its weekly
-- series. Staff only. Finished events are never touched. League games keep the groups set by the
-- league links, so they cannot be changed here.
--
-- Adding a group lets its members see the event and answer (absence periods apply by themselves).
-- Removing a group takes away the answers and records of the people who are no longer in any group
-- of the event.

create function public.set_event_groups(
  p_event_id uuid,
  p_group_ids smallint[],
  p_scope text default 'one'
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events;
  v_target uuid;
  v_changed integer := 0;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_group_ids), 0) = 0
     or (select count(*) from public.groups where id = any (p_group_ids))
        <> (select count(distinct g) from unnest(p_group_ids) g) then
    raise exception 'groups_required' using errcode = 'P0001';
  end if;
  if p_scope is null or p_scope not in ('one', 'following') then
    raise exception 'scope_invalid' using errcode = 'P0001';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_event.league_match_id is not null then
    raise exception 'league_event' using errcode = 'P0001';
  end if;
  if v_event.ends_at <= now() then
    raise exception 'event_ended' using errcode = 'P0001';
  end if;

  for v_target in
    select e.id from public.events e
    where e.league_match_id is null
      and e.ends_at > now()
      and (e.id = p_event_id
           or (p_scope = 'following' and v_event.series_id is not null
               and e.series_id = v_event.series_id and e.starts_at >= v_event.starts_at))
    order by e.starts_at
  loop
    -- New groups first, so the event never has none.
    insert into public.event_groups (event_id, group_id)
      select v_target, g from (select distinct unnest(p_group_ids) g) x
      on conflict do nothing;
    delete from public.event_groups
      where event_id = v_target and group_id <> all (p_group_ids);
    delete from public.attendance_answers a
      where a.event_id = v_target
        and not exists (
          select 1 from public.group_members gm
          join public.event_groups eg on eg.group_id = gm.group_id and eg.event_id = v_target
          where gm.user_id = a.user_id);
    delete from public.attendance_records r
      where r.event_id = v_target
        and not exists (
          select 1 from public.group_members gm
          join public.event_groups eg on eg.group_id = gm.group_id and eg.event_id = v_target
          where gm.user_id = r.user_id);
    v_changed := v_changed + 1;
  end loop;
  return v_changed;
end
$$;

-- Privileges -----------------------------------------------------------

revoke all on function public.set_event_groups(uuid, smallint[], text) from public, anon, authenticated;
grant execute on function public.set_event_groups(uuid, smallint[], text) to authenticated;
