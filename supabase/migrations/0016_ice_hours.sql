-- Ice hours: which rink each event uses, and cancelled events.
-- The club pays the venue a monthly flat fee and the venue counts the real hours at the end of the
-- season. The board needs its own count, per rink, to compare. The booked ice is the event's own
-- start and end. An event with nobody present still counts. A cancelled event is kept, marked
-- cancelled, and counted apart; deleting stays for mistakes.
-- Prices are optional and only the board sees them.

-- The club's rinks. Everyone in the club reads the names; only the board changes them.
create table public.rinks (
  id smallint generated always as identity primary key,
  name text not null check (length(trim(name)) between 1 and 40)
);
create unique index rinks_name_key on public.rinks (lower(trim(name)));

-- Price per hour of a rink, in cents. Board only, for reading as well.
create table public.rink_prices (
  rink_id smallint primary key references public.rinks (id) on delete cascade,
  price_cents integer not null check (price_cents between 0 and 100000)
);

-- A rink in use cannot be removed: the hours would silently disappear from the count.
alter table public.events
  add column rink_id smallint references public.rinks (id),
  add column cancelled_at timestamptz;
create index events_rink_id_idx on public.events (rink_id) where rink_id is not null;

-- Creating events now takes the rink, for one event or a whole series.
drop function public.create_event(public.event_type, text, timestamptz, timestamptz, timestamptz, text, smallint[], text, text, integer);
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
  p_repeat_weeks integer default 0,
  p_rink_id smallint default null
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
      series_id, type, title, starts_at, ends_at, meetup_at, venue, opponent, home_away, rink_id
    ) values (
      v_series, p_type, p_title,
      (p_starts_at at time zone 'Europe/Rome' + make_interval(weeks => v_week)) at time zone 'Europe/Rome',
      (p_ends_at at time zone 'Europe/Rome' + make_interval(weeks => v_week)) at time zone 'Europe/Rome',
      (p_meetup_at at time zone 'Europe/Rome' + make_interval(weeks => v_week)) at time zone 'Europe/Rome',
      p_venue, p_opponent, p_home_away, p_rink_id
    ) returning id into v_id;
    insert into public.event_groups (event_id, group_id)
      select v_id, g from (select distinct unnest(p_group_ids) g) x;
    v_first := coalesce(v_first, v_id);
  end loop;
  return v_first;
end
$$;

-- Answering and the staff lists, with cancelled events left out.
create or replace function public.answer_attendance(p_event_id uuid, p_answer public.attendance_answer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ends timestamptz;
  v_cancelled timestamptz;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select ends_at, cancelled_at into v_ends, v_cancelled from public.events where id = p_event_id;
  if not found or not public.in_event_groups(p_event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_cancelled is not null then
    raise exception 'event_cancelled' using errcode = 'P0001';
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

create or replace function public.unanswered_people(p_days integer default 7)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  missing bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with pairs as (
    select distinct e.id as event_id, gm.user_id as person_id
    from public.events e
    join public.event_groups eg on eg.event_id = e.id
    join public.group_members gm on gm.group_id = eg.group_id
    where e.cancelled_at is null
      and e.ends_at > now()
      and e.starts_at < now() + make_interval(days => greatest(p_days, 0))
  )
  select p.id, p.first_name, p.last_name, c.email, c.phone, count(*)::bigint
  from pairs
  join public.profiles p on p.id = pairs.person_id
  join public.profile_contacts c on c.user_id = p.id
  where not exists (
    select 1 from public.attendance_answers a
    where a.event_id = pairs.event_id and a.user_id = pairs.person_id
  )
  group by p.id, p.first_name, p.last_name, c.email, c.phone
  order by count(*) desc, p.last_name, p.first_name;
end
$$;

create or replace function public.attendance_summary(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  events_total bigint,
  answered_present bigint,
  answered_absent bigint,
  no_answer bigint,
  on_time bigint,
  late bigint,
  excused bigint,
  unexcused bigint,
  injured bigint,
  not_called_up bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with pairs as (
    select distinct e.id as event_id, gm.user_id as person_id
    from public.events e
    join public.event_groups eg on eg.event_id = e.id
    join public.group_members gm on gm.group_id = eg.group_id
    where e.cancelled_at is null
      and e.ends_at <= now()
      and (p_from is null or e.starts_at >= p_from)
      and (p_to is null or e.starts_at < p_to)
  )
  select p.id, p.first_name, p.last_name,
    count(*)::bigint,
    (count(*) filter (where a.answer = 'present'))::bigint,
    (count(*) filter (where a.answer = 'absent'))::bigint,
    (count(*) filter (where a.answer is null))::bigint,
    (count(*) filter (where r.status = 'on_time'))::bigint,
    (count(*) filter (where r.status = 'late'))::bigint,
    (count(*) filter (where r.status = 'excused'))::bigint,
    (count(*) filter (where r.status = 'unexcused'))::bigint,
    (count(*) filter (where r.status = 'injured'))::bigint,
    (count(*) filter (where r.status = 'not_called_up'))::bigint
  from pairs
  join public.profiles p on p.id = pairs.person_id
  left join public.attendance_answers a on a.event_id = pairs.event_id and a.user_id = pairs.person_id
  left join public.attendance_records r on r.event_id = pairs.event_id and r.user_id = pairs.person_id
  group by p.id, p.first_name, p.last_name
  order by p.last_name, p.first_name;
end
$$;

-- A cancelled event takes no answers, and drops out of the lists of who has not answered and of
-- the attendance summary.

-- Privileges -----------------------------------------------------------

revoke all on public.rinks, public.rink_prices from public, anon, authenticated;
revoke all on function public.create_event(public.event_type, text, timestamptz, timestamptz, timestamptz, text, smallint[], text, text, integer, smallint)
  from public, anon, authenticated;

grant select on public.rinks to authenticated;
grant insert (name), update (name), delete on public.rinks to authenticated;
grant select, insert, update, delete on public.rink_prices to authenticated;
grant update (rink_id, cancelled_at) on public.events to authenticated;
grant execute on function
  public.create_event(public.event_type, text, timestamptz, timestamptz, timestamptz, text, smallint[], text, text, integer, smallint)
  to authenticated;

alter table public.rinks enable row level security;
alter table public.rink_prices enable row level security;

create policy rinks_select on public.rinks for select to authenticated
  using ((select public.is_member()));
create policy rinks_insert on public.rinks for insert to authenticated
  with check ((select public.is_board()));
create policy rinks_update on public.rinks for update to authenticated
  using ((select public.is_board())) with check ((select public.is_board()));
create policy rinks_delete on public.rinks for delete to authenticated
  using ((select public.is_board()));

create policy rink_prices_select on public.rink_prices for select to authenticated
  using ((select public.is_board()));
create policy rink_prices_insert on public.rink_prices for insert to authenticated
  with check ((select public.is_board()));
create policy rink_prices_update on public.rink_prices for update to authenticated
  using ((select public.is_board())) with check ((select public.is_board()));
create policy rink_prices_delete on public.rink_prices for delete to authenticated
  using ((select public.is_board()));
