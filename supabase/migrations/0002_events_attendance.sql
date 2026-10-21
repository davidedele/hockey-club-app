-- Step 2: events with weekly repeat, and attendance answers and records.
-- Row level security is on for every table. An event is shown to the groups chosen for it.

create type public.event_type as enum ('training', 'game');
create type public.attendance_answer as enum ('present', 'absent');
create type public.attendance_status as enum
  ('on_time', 'late', 'excused', 'unexcused', 'injured', 'not_called_up');

-- Events ---------------------------------------------------------------
-- series_id ties together the trainings created by one weekly repeat. It has no table of its own.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  series_id uuid,
  type public.event_type not null,
  title text not null check (length(trim(title)) between 1 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  meetup_at timestamptz,
  venue text check (length(venue) <= 120),
  opponent text check (length(opponent) <= 80),
  home_away text check (home_away in ('home', 'away')),
  score_for smallint check (score_for >= 0),
  score_against smallint check (score_against >= 0),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (meetup_at is null or meetup_at <= starts_at),
  -- Opponent, home or away and score belong to games only.
  check (type = 'game' or (opponent is null and home_away is null
                           and score_for is null and score_against is null)),
  check ((score_for is null) = (score_against is null))
);
create index events_starts_at_idx on public.events (starts_at);
create index events_series_id_idx on public.events (series_id) where series_id is not null;

create table public.event_groups (
  event_id uuid not null references public.events (id) on delete cascade,
  group_id smallint not null references public.groups (id) on delete cascade,
  primary key (event_id, group_id)
);
create index event_groups_group_id_idx on public.event_groups (group_id);

-- A person's answer for an event. Written only through answer_attendance.
create table public.attendance_answers (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer public.attendance_answer not null,
  answered_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index attendance_answers_user_id_idx on public.attendance_answers (user_id);

-- Who actually came, recorded by staff after the event.
create table public.attendance_records (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.attendance_status not null,
  primary key (event_id, user_id)
);
create index attendance_records_user_id_idx on public.attendance_records (user_id);

-- Helpers used by the policies -----------------------------------------

create function public.in_event_groups(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.event_groups eg
    join public.group_members gm on gm.group_id = eg.group_id
    where eg.event_id = p_event_id and gm.user_id = auth.uid()
  )
$$;

create function public.can_see_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff() or public.in_event_groups(p_event_id)
$$;

-- An event always keeps at least one group, or nobody but staff could see it.
create function public.keep_one_event_group() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.events where id = old.event_id)
     and not exists (
       select 1 from public.event_groups
       where event_id = old.event_id and group_id <> old.group_id
     ) then
    raise exception 'event_needs_group' using errcode = 'P0001';
  end if;
  return old;
end
$$;

create trigger event_groups_keep_one
  before delete on public.event_groups
  for each row execute function public.keep_one_event_group();

-- Creating events ------------------------------------------------------
-- Creates one event, or a weekly series of trainings (the first one plus p_repeat_weeks more).
-- Repeats keep the same clock time in Italy, also across the change to and from summer time.
create function public.create_event(
  p_type public.event_type,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_meetup_at timestamptz,
  p_venue text,
  p_group_ids smallint[],
  p_opponent text default null,
  p_home_away text default null,
  p_repeat_weeks integer default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_series uuid;
  v_first uuid;
  v_id uuid;
  v_week integer;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_group_ids), 0) = 0
     or (select count(*) from public.groups where id = any (p_group_ids))
        <> (select count(distinct g) from unnest(p_group_ids) g) then
    raise exception 'groups_required' using errcode = 'P0001';
  end if;
  if p_repeat_weeks < 0 or p_repeat_weeks > 52 then
    raise exception 'repeat_invalid' using errcode = 'P0001';
  end if;
  if p_repeat_weeks > 0 and p_type <> 'training' then
    raise exception 'repeat_only_training' using errcode = 'P0001';
  end if;
  if p_repeat_weeks > 0 then
    v_series := gen_random_uuid();
  end if;

  for v_week in 0 .. p_repeat_weeks loop
    insert into public.events (
      series_id, type, title, starts_at, ends_at, meetup_at, venue, opponent, home_away
    ) values (
      v_series, p_type, p_title,
      (p_starts_at at time zone 'Europe/Rome' + make_interval(weeks => v_week)) at time zone 'Europe/Rome',
      (p_ends_at at time zone 'Europe/Rome' + make_interval(weeks => v_week)) at time zone 'Europe/Rome',
      (p_meetup_at at time zone 'Europe/Rome' + make_interval(weeks => v_week)) at time zone 'Europe/Rome',
      p_venue, p_opponent, p_home_away
    ) returning id into v_id;
    insert into public.event_groups (event_id, group_id)
      select v_id, g from (select distinct unnest(p_group_ids) g) x;
    v_first := coalesce(v_first, v_id);
  end loop;
  return v_first;
end
$$;

-- Answering ------------------------------------------------------------
-- A member answers for an event shown to one of their groups, until the event ends.
create function public.answer_attendance(p_event_id uuid, p_answer public.attendance_answer)
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
  do update set answer = excluded.answer, answered_at = now();
end
$$;

-- Staff view of an event: everyone in its groups with their answer and the recorded status.
-- Someone outside its groups appears only if they have an answer or a record.
create function public.event_attendance(p_event_id uuid)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  answer public.attendance_answer,
  status public.attendance_status
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select p.id, p.first_name, p.last_name, a.answer, r.status
  from public.profiles p
  left join public.attendance_answers a on a.event_id = p_event_id and a.user_id = p.id
  left join public.attendance_records r on r.event_id = p_event_id and r.user_id = p.id
  where p.id in (
      select gm.user_id from public.event_groups eg
      join public.group_members gm on gm.group_id = eg.group_id
      where eg.event_id = p_event_id
    )
    or a.user_id is not null or r.user_id is not null
  order by p.last_name, p.first_name;
end
$$;

-- Privileges -----------------------------------------------------------
-- Supabase grants broadly to new tables and functions, so start from nothing here too.

revoke all on public.events, public.event_groups,
  public.attendance_answers, public.attendance_records from public, anon, authenticated;
revoke all on function
  public.in_event_groups(uuid), public.can_see_event(uuid), public.keep_one_event_group(),
  public.create_event(public.event_type, text, timestamptz, timestamptz, timestamptz, text, smallint[], text, text, integer),
  public.answer_attendance(uuid, public.attendance_answer),
  public.event_attendance(uuid)
  from public, anon, authenticated;

grant select on public.events, public.event_groups,
  public.attendance_answers, public.attendance_records to authenticated;
grant update (title, starts_at, ends_at, meetup_at, venue, opponent, home_away, score_for, score_against)
  on public.events to authenticated;
grant delete on public.events to authenticated;
grant insert, delete on public.event_groups to authenticated;
grant insert (event_id, user_id, status) on public.attendance_records to authenticated;
grant update (status) on public.attendance_records to authenticated;
grant delete on public.attendance_records to authenticated;

grant execute on function
  public.in_event_groups(uuid), public.can_see_event(uuid),
  public.create_event(public.event_type, text, timestamptz, timestamptz, timestamptz, text, smallint[], text, text, integer),
  public.answer_attendance(uuid, public.attendance_answer),
  public.event_attendance(uuid)
  to authenticated;

-- Row level security ---------------------------------------------------

alter table public.events enable row level security;
alter table public.event_groups enable row level security;
alter table public.attendance_answers enable row level security;
alter table public.attendance_records enable row level security;

create policy events_select on public.events for select to authenticated
  using (public.can_see_event(id));
create policy events_update on public.events for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy events_delete on public.events for delete to authenticated
  using (public.is_staff());

create policy event_groups_select on public.event_groups for select to authenticated
  using (public.can_see_event(event_id));
create policy event_groups_insert on public.event_groups for insert to authenticated
  with check (public.is_staff());
create policy event_groups_delete on public.event_groups for delete to authenticated
  using (public.is_staff());

-- Players see only their own answers. Staff see all.
create policy answers_select on public.attendance_answers for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy records_select on public.attendance_records for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy records_insert on public.attendance_records for insert to authenticated
  with check (public.is_staff());
create policy records_update on public.attendance_records for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy records_delete on public.attendance_records for delete to authenticated
  using (public.is_staff());
