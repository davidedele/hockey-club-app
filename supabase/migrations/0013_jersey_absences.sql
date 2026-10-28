-- Jersey colour for games, and absence periods.

-- Jersey colour ---------------------------------------------------------
-- Staff say which of the club's two jerseys to bring to a game. The board names them,
-- Chiara and Scura unless changed; events keep the slot, light or dark.
alter table public.events add column jersey text check (jersey in ('light', 'dark'));
alter table public.events add constraint events_jersey_game check (type = 'game' or jersey is null);
grant update (jersey) on public.events to authenticated;

alter table public.club_settings
  add column jersey_light_name text not null default 'Chiara' check (length(trim(jersey_light_name)) between 1 and 20),
  add column jersey_dark_name text not null default 'Scura' check (length(trim(jersey_dark_name)) between 1 and 20);
grant update (jersey_light_name, jersey_dark_name) on public.club_settings to authenticated;

-- Absence periods -------------------------------------------------------
-- A person is away from one day to another (Italian dates, both included). Every event of
-- their groups in that range gets an Absent answer, including events created later.
-- An answer the person gives themself always wins. Removing a period removes the answers it
-- gave to events that have not ended yet. The reason is seen by the person and by staff only.
create type public.absence_reason as enum ('work', 'injury', 'illness', 'travel', 'other');

create table public.absence_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason public.absence_reason,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (ends_on - starts_on <= 365)
);
create index absence_periods_user_id_idx on public.absence_periods (user_id, ends_on);
create index absence_periods_created_by_idx on public.absence_periods (created_by);

-- Which period gave an answer. Cleared when the person answers themself.
alter table public.attendance_answers
  add column from_period uuid references public.absence_periods (id) on delete cascade;
create index attendance_answers_from_period_idx on public.attendance_answers (from_period)
  where from_period is not null;

-- Absent answers from one period for the events of the person's groups that fall in it,
-- have not ended and have no answer yet.
create function public.apply_absence(p_period uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.attendance_answers (event_id, user_id, answer, from_period)
  select distinct e.id, ap.user_id, 'absent'::public.attendance_answer, ap.id
  from public.absence_periods ap
  join public.group_members gm on gm.user_id = ap.user_id
  join public.event_groups eg on eg.group_id = gm.group_id
  join public.events e on e.id = eg.event_id
  where ap.id = p_period
    and e.ends_at > now()
    and (e.starts_at at time zone 'Europe/Rome')::date between ap.starts_on and ap.ends_on
  on conflict (event_id, user_id) do nothing
$$;

-- A person sets their own period; staff can set one for anyone.
create function public.add_absence(
  p_user_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_reason public.absence_reason default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_member()
     or (p_user_id is distinct from auth.uid() and not public.is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_ends_on < (now() at time zone 'Europe/Rome')::date then
    raise exception 'period_past' using errcode = 'P0001';
  end if;
  insert into public.absence_periods (user_id, starts_on, ends_on, reason, created_by)
  values (p_user_id, p_starts_on, p_ends_on, p_reason, auth.uid())
  returning id into v_id;
  perform public.apply_absence(v_id);
  return v_id;
end
$$;

-- Removing a period keeps the answers it gave to events that already ended, so the past does not change.
create function public.keep_past_absences() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.attendance_answers a set from_period = null
  from public.events e
  where a.from_period = old.id and e.id = a.event_id and e.ends_at <= now();
  return old;
end
$$;
create trigger absence_periods_keep_past
  before delete on public.absence_periods
  for each row execute function public.keep_past_absences();

-- A new event, or an event shown to one more group, also counts the periods of its people.
create function public.absences_for_event_group() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.attendance_answers (event_id, user_id, answer, from_period)
  select distinct on (gm.user_id) new.event_id, gm.user_id, 'absent'::public.attendance_answer, ap.id
  from public.group_members gm
  join public.absence_periods ap on ap.user_id = gm.user_id
  join public.events e on e.id = new.event_id
  where gm.group_id = new.group_id
    and e.ends_at > now()
    and (e.starts_at at time zone 'Europe/Rome')::date between ap.starts_on and ap.ends_on
  order by gm.user_id, ap.created_at
  on conflict (event_id, user_id) do nothing;
  return null;
end
$$;
create trigger event_groups_absences
  after insert on public.event_groups
  for each row execute function public.absences_for_event_group();

-- Someone who joins a group also gets their periods applied to that group's events.
create function public.absences_for_new_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.apply_absence(ap.id)
  from public.absence_periods ap
  where ap.user_id = new.user_id and ap.ends_on >= (now() at time zone 'Europe/Rome')::date;
  return null;
end
$$;
create trigger group_members_absences
  after insert on public.group_members
  for each row execute function public.absences_for_new_member();

-- The person's own answer replaces one that came from a period.
create or replace function public.answer_attendance(p_event_id uuid, p_answer public.attendance_answer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ends timestamptz;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select ends_at into v_ends from public.events where id = p_event_id;
  if not found or not public.in_event_groups(p_event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_ends <= now() then
    raise exception 'event_over' using errcode = 'P0001';
  end if;
  insert into public.attendance_answers (event_id, user_id, answer)
  values (p_event_id, auth.uid(), p_answer)
  on conflict (event_id, user_id)
  do update set answer = excluded.answer, answered_at = now(), from_period = null;
end
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.absence_periods from public, anon, authenticated;
revoke all on function
  public.apply_absence(uuid),
  public.add_absence(uuid, date, date, public.absence_reason),
  public.keep_past_absences(),
  public.absences_for_event_group(),
  public.absences_for_new_member()
  from public, anon, authenticated;

grant select, delete on public.absence_periods to authenticated;
grant execute on function public.add_absence(uuid, date, date, public.absence_reason) to authenticated;

alter table public.absence_periods enable row level security;

create policy absence_periods_select on public.absence_periods for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy absence_periods_delete on public.absence_periods for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
