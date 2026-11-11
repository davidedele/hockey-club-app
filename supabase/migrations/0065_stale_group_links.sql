-- League games follow the group links when they change, and leaving a group clears what was left behind.
-- 1. When the board changes a group's league team or competitions, coming league games drop the groups
--    that no longer play them. A game always keeps at least one group.
-- 2. When someone leaves a group, their answers and line-up places on coming events of that group go,
--    unless another group of the event is still theirs.
-- 3. The coming league games are tidied once now, for links made before this change.
-- Finished events are never touched, so attendance history stays as it was.

-- Removes, on one coming event, the answers, presence records and line-up places of people who are in
-- none of the event's groups any more.
create function public.clear_uninvited(p_event_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.attendance_answers a
  where a.event_id = p_event_id
    and not exists (
      select 1 from public.group_members gm
      join public.event_groups eg on eg.group_id = gm.group_id and eg.event_id = p_event_id
      where gm.user_id = a.user_id);
  delete from public.attendance_records r
  where r.event_id = p_event_id
    and not exists (
      select 1 from public.group_members gm
      join public.event_groups eg on eg.group_id = gm.group_id and eg.event_id = p_event_id
      where gm.user_id = r.user_id);
  delete from public.event_lineup l
  where l.event_id = p_event_id
    and not exists (
      select 1 from public.group_members gm
      join public.event_groups eg on eg.group_id = gm.group_id and eg.event_id = p_event_id
      where gm.user_id = l.user_id);
end
$$;

-- Drops from coming league games the groups whose league team or competitions no longer match the
-- game. Returns how many group links were dropped.
create function public.tidy_league_event_groups() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
  v_dropped integer := 0;
  v_n integer;
begin
  for v_event in
    select e.id from public.events e
    where e.league_match_id is not null and e.ends_at > now()
  loop
    delete from public.event_groups eg
    using public.events e, public.league_matches m, public.groups g
    where eg.event_id = v_event and e.id = eg.event_id and m.id = e.league_match_id and g.id = eg.group_id
      and not (g.league_team is not null
               and (m.home = g.league_team or m.away = g.league_team)
               and m.championship_id = any (g.league_championships))
      -- The game keeps at least one group: when none matches, the groups stay as they are.
      and exists (
        select 1 from public.event_groups k join public.groups kg on kg.id = k.group_id
        where k.event_id = v_event
          and kg.league_team is not null
          and (m.home = kg.league_team or m.away = kg.league_team)
          and m.championship_id = any (kg.league_championships));
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_dropped := v_dropped + v_n;
      perform public.clear_uninvited(v_event);
    end if;
  end loop;
  return v_dropped;
end
$$;

create function public.groups_league_links_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.tidy_league_event_groups();
  return null;
end
$$;
create trigger groups_league_links_changed
  after update of league_team, league_championships on public.groups
  for each row
  when (old.league_team is distinct from new.league_team
        or old.league_championships is distinct from new.league_championships)
  execute function public.groups_league_links_changed();

create function public.member_left_group() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
begin
  for v_event in
    select e.id from public.events e
    join public.event_groups eg on eg.event_id = e.id and eg.group_id = old.group_id
    where e.ends_at > now()
  loop
    perform public.clear_uninvited(v_event);
  end loop;
  return null;
end
$$;
create trigger group_members_left
  after delete on public.group_members
  for each row execute function public.member_left_group();

-- Used only inside the database; nobody calls them directly.
revoke all on function public.clear_uninvited(uuid), public.tidy_league_event_groups(),
  public.groups_league_links_changed(), public.member_left_group() from public, anon, authenticated;

-- Links made before this change.
select public.tidy_league_event_groups();
