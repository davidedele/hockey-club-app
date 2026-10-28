-- Emails about the calendar: a new event, and a change to an event that has not been played yet
-- (start, end, meetup, place, cancelled or back on). The hourly server function asks who is due and
-- sends one email per person, then marks what went out. A person never gets an email about what they
-- did themselves. Nothing is sent between 22:00 and 08:00 Italian time, nothing about something older
-- than three days, and nothing to people who switched the club emails off (same switch as the
-- reminders).
--
-- An event counts as new for a person when one of their groups was added to it in the last three days,
-- so it also covers a group added later to an existing event.

alter table public.events
  add column created_by uuid references public.profiles (id) on delete set null default auth.uid();
create index events_created_by_idx on public.events (created_by) where created_by is not null;

-- When a group was added to an event. Existing rows take the time the event was made.
alter table public.event_groups add column created_at timestamptz not null default now();
update public.event_groups eg set created_at = e.created_at from public.events e where e.id = eg.event_id;

-- Every change to what people plan around, with the old values, so the email can say what moved.
create table public.event_changes (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  actor uuid,
  changed_at timestamptz not null default now(),
  old_starts_at timestamptz not null,
  new_starts_at timestamptz not null,
  old_ends_at timestamptz not null,
  new_ends_at timestamptz not null,
  old_meetup_at timestamptz,
  new_meetup_at timestamptz,
  old_venue text,
  new_venue text,
  old_cancelled boolean not null,
  new_cancelled boolean not null
);
create index event_changes_event_id_idx on public.event_changes (event_id);

-- What was already sent, so nobody gets the same email twice.
create table public.event_new_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index event_new_log_event_id_idx on public.event_new_log (event_id);
create table public.event_change_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  change_id bigint not null references public.event_changes (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, change_id)
);
create index event_change_log_change_id_idx on public.event_change_log (change_id);

create function public.record_event_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_changes (
    event_id, actor, old_starts_at, new_starts_at, old_ends_at, new_ends_at,
    old_meetup_at, new_meetup_at, old_venue, new_venue, old_cancelled, new_cancelled
  ) values (
    new.id, auth.uid(), old.starts_at, new.starts_at, old.ends_at, new.ends_at,
    old.meetup_at, new.meetup_at, old.venue, new.venue,
    old.cancelled_at is not null, new.cancelled_at is not null
  );
  return null;
end
$$;

create trigger events_record_change
  after update on public.events
  for each row
  when (old.ends_at > now() and (
    old.starts_at is distinct from new.starts_at
    or old.ends_at is distinct from new.ends_at
    or old.meetup_at is distinct from new.meetup_at
    or old.venue is distinct from new.venue
    or (old.cancelled_at is null) <> (new.cancelled_at is null)))
  execute function public.record_event_change();

-- Who is due an email now: one row per person and event, either a new event or a change.
-- Only the server function calls this.
create function public.event_notices_due(p_now timestamptz default now())
returns table (
  user_id uuid,
  email text,
  first_name text,
  kind text,
  event_id uuid,
  change_id bigint,
  title text,
  type public.event_type,
  series_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  meetup_at timestamptz,
  venue text,
  cancelled boolean,
  old_starts_at timestamptz,
  old_ends_at timestamptz,
  old_meetup_at timestamptz,
  old_venue text,
  old_cancelled boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hour integer := extract(hour from p_now at time zone 'Europe/Rome');
begin
  if v_hour < 8 or v_hour >= 22 then
    return;
  end if;
  return query
  select pr.id, c.email, pr.first_name, 'new'::text, e.id, null::bigint, e.title, e.type, e.series_id,
         e.starts_at, e.ends_at, e.meetup_at, e.venue, false,
         null::timestamptz, null::timestamptz, null::timestamptz, null::text, null::boolean
  from public.events e
  join lateral (
    select distinct gm.user_id from public.event_groups eg
    join public.group_members gm on gm.group_id = eg.group_id
    where eg.event_id = e.id and eg.created_at > p_now - interval '3 days'
  ) m on true
  join public.profiles pr on pr.id = m.user_id
  join public.profile_contacts c on c.user_id = pr.id
  where e.starts_at > p_now
    and e.cancelled_at is null
    and pr.id is distinct from e.created_by
    and not exists (select 1 from public.reminder_prefs rp where rp.user_id = pr.id and not rp.enabled)
    and not exists (select 1 from public.event_new_log l where l.event_id = e.id and l.user_id = pr.id)
  union all
  select pr.id, c.email, pr.first_name, 'changed'::text, e.id, ch.id, e.title, e.type, e.series_id,
         ch.new_starts_at, ch.new_ends_at, ch.new_meetup_at, ch.new_venue, ch.new_cancelled,
         ch.old_starts_at, ch.old_ends_at, ch.old_meetup_at, ch.old_venue, ch.old_cancelled
  from public.event_changes ch
  join public.events e on e.id = ch.event_id
  join lateral (
    select distinct gm.user_id from public.event_groups eg
    join public.group_members gm on gm.group_id = eg.group_id
    where eg.event_id = e.id
  ) m on true
  join public.profiles pr on pr.id = m.user_id
  join public.profile_contacts c on c.user_id = pr.id
  where ch.changed_at > p_now - interval '3 days'
    and e.ends_at > p_now
    and pr.id is distinct from ch.actor
    and not exists (select 1 from public.reminder_prefs rp where rp.user_id = pr.id and not rp.enabled)
    and not exists (select 1 from public.event_change_log l where l.change_id = ch.id and l.user_id = pr.id)
  order by 1, 10;
end
$$;

-- The server function marks what it sent.
create function public.event_notices_mark_sent(p_user uuid, p_events uuid[], p_changes bigint[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_new_log (user_id, event_id)
  select p_user, e from unnest(coalesce(p_events, '{}'::uuid[])) e
  on conflict do nothing;
  insert into public.event_change_log (user_id, change_id)
  select p_user, c from unnest(coalesce(p_changes, '{}'::bigint[])) c
  on conflict do nothing;
end
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.event_changes, public.event_new_log, public.event_change_log from public, anon, authenticated;
revoke all on function public.record_event_change(), public.event_notices_due(timestamptz),
  public.event_notices_mark_sent(uuid, uuid[], bigint[]) from public, anon, authenticated;
grant execute on function public.event_notices_due(timestamptz), public.event_notices_mark_sent(uuid, uuid[], bigint[]) to service_role;

alter table public.event_changes enable row level security;
alter table public.event_new_log enable row level security;
alter table public.event_change_log enable row level security;
-- These tables have no policies on purpose: only the database and the server function read them.
