-- Line-ups: who plays where in one event. The coach prepares them before the session, different
-- every time; for a game they are optional and entered before the match. Everyone who sees the
-- event sees its line-up.
--
-- Places follow ice hockey: four forward lines (left wing, centre, right wing), three defence pairs
-- (left, right) and two goalies. A player holds one place only, so nobody is listed twice.

create type public.lineup_slot as enum (
  'left_wing', 'centre', 'right_wing', 'left_defence', 'right_defence', 'goalie'
);

create table public.event_lineup (
  event_id uuid not null references public.events (id) on delete cascade,
  slot public.lineup_slot not null,
  unit smallint not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  set_by uuid references public.profiles (id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (event_id, slot, unit),
  unique (event_id, user_id),
  constraint event_lineup_unit_range check (
    case
      when slot in ('left_wing', 'centre', 'right_wing') then unit between 1 and 4
      when slot in ('left_defence', 'right_defence') then unit between 1 and 3
      else unit between 1 and 2
    end
  )
);
create index event_lineup_user_id_idx on public.event_lineup (user_id);
create index event_lineup_set_by_idx on public.event_lineup (set_by);

-- A line-up is a plan, so it is only written while the event is still to come and not cancelled,
-- and only for people the event is shown to. Who wrote a place and when is set here, never by the
-- app. Removing places is always allowed: it is how a line-up is cleared and how the database
-- tidies up after a group change or a member who leaves.
create function public.check_lineup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_event public.events;
begin
  select * into v_event from public.events where id = new.event_id;
  if v_event.cancelled_at is not null then
    raise exception 'event_cancelled' using errcode = 'P0001';
  end if;
  if v_event.ends_at <= now() then
    raise exception 'event_ended' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.event_groups eg
    join public.group_members gm on gm.group_id = eg.group_id
    where eg.event_id = new.event_id and gm.user_id = new.user_id
  ) then
    raise exception 'player_not_in_event' using errcode = 'P0001';
  end if;
  new.set_by := auth.uid();
  new.set_at := now();
  return new;
end
$$;

create trigger event_lineup_check
  before insert or update on public.event_lineup
  for each row execute function public.check_lineup();

-- One tap in the app: put a player in a place, or empty it by passing nobody. Doing the whole move
-- at once keeps the line-up whole, because the player leaves the place they held before and the
-- place being filled is freed first. The checks above still apply, so the event must still be to
-- come and the player must be one of the people the event is for.
create function public.set_lineup_place(
  p_event_id uuid,
  p_slot public.lineup_slot,
  p_unit integer,
  p_user_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.event_lineup
    where event_id = p_event_id and slot = p_slot and unit = p_unit;
  if p_user_id is not null then
    delete from public.event_lineup
      where event_id = p_event_id and user_id = p_user_id;
    insert into public.event_lineup (event_id, slot, unit, user_id)
      values (p_event_id, p_slot, p_unit::smallint, p_user_id);
  end if;
end
$$;

-- Everyone the event is shown to, with the answer they gave and the position they usually play,
-- so the coach picks from the right people. Staff only: players just read the finished line-up.
create function public.lineup_candidates(p_event_id uuid)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  jersey_number smallint,
  "position" text,
  answer public.attendance_answer
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.last_name, p.jersey_number, p.position, a.answer
  from public.profiles p
  left join public.attendance_answers a on a.event_id = p_event_id and a.user_id = p.id
  where public.is_staff()
    and exists (
      select 1 from public.group_members gm
      join public.event_groups eg on eg.group_id = gm.group_id and eg.event_id = p_event_id
      where gm.user_id = p.id
    )
  order by p.last_name, p.first_name
$$;

-- A group taken off an event takes the places of the people who are no longer in it, the same way
-- it takes their answers and records. The rest of the function is unchanged.
create or replace function public.set_event_groups(
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
    delete from public.event_lineup l
      where l.event_id = v_target
        and not exists (
          select 1 from public.group_members gm
          join public.event_groups eg on eg.group_id = gm.group_id and eg.event_id = v_target
          where gm.user_id = l.user_id);
    v_changed := v_changed + 1;
  end loop;
  return v_changed;
end
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.event_lineup from public, anon, authenticated;
revoke all on function public.check_lineup(), public.lineup_candidates(uuid),
  public.set_lineup_place(uuid, public.lineup_slot, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.lineup_candidates(uuid),
  public.set_lineup_place(uuid, public.lineup_slot, integer, uuid) to authenticated;

grant select, delete on public.event_lineup to authenticated;
grant insert (event_id, slot, unit, user_id) on public.event_lineup to authenticated;
grant update (slot, unit, user_id) on public.event_lineup to authenticated;

alter table public.event_lineup enable row level security;

-- Everyone who sees the event sees the line-up. Only staff write it.
create policy event_lineup_select on public.event_lineup for select to authenticated
  using (public.can_see_event(event_id));
create policy event_lineup_insert on public.event_lineup for insert to authenticated
  with check (public.is_staff());
create policy event_lineup_update on public.event_lineup for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy event_lineup_delete on public.event_lineup for delete to authenticated
  using (public.is_staff());
