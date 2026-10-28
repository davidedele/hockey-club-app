-- Reminder emails. A person who has not answered for an event of their groups gets one email that
-- lists every event still waiting: a first one when the event is less than three days away, and a
-- last one when it is less than a day away. Each person can switch reminders off. The server
-- function that sends the emails (service role) asks for who is due and then marks them as sent.
-- Nothing is sent between 22:00 and 08:00 Italian time.

-- A person who never chose has reminders on, so a missing row means on.
create table public.reminder_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null
);

-- What was already sent, so nobody gets the same reminder twice.
create table public.reminder_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('first', 'last')),
  sent_at timestamptz not null default now(),
  primary key (user_id, event_id, kind)
);
create index reminder_log_event_id_idx on public.reminder_log (event_id);

-- A person switches their own reminders on or off.
create function public.set_reminders(p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.reminder_prefs (user_id, enabled) values (auth.uid(), p_enabled)
  on conflict (user_id) do update set enabled = excluded.enabled;
end
$$;

-- Who is due a reminder now, one row per person and event. Only the server function calls this.
create function public.reminders_due(p_now timestamptz default now())
returns table (
  user_id uuid,
  email text,
  first_name text,
  kind text,
  event_id uuid,
  title text,
  type public.event_type,
  starts_at timestamptz,
  venue text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hour integer := extract(hour from p_now at time zone 'Europe/Rome');
begin
  if v_hour < 8 or v_hour >= 22 then
    return;
  end if;
  return query
  with pairs as (
    select distinct e.id as eid, gm.user_id as uid,
      case when e.starts_at <= p_now + interval '1 day' then 'last' else 'first' end as k
    from public.events e
    join public.event_groups eg on eg.event_id = e.id
    join public.group_members gm on gm.group_id = eg.group_id
    where e.cancelled_at is null
      and e.starts_at > p_now
      and e.starts_at <= p_now + interval '3 days'
  )
  select p.uid, c.email, pr.first_name, p.k, e.id, e.title, e.type, e.starts_at, e.venue
  from pairs p
  join public.events e on e.id = p.eid
  join public.profiles pr on pr.id = p.uid
  join public.profile_contacts c on c.user_id = p.uid
  where not exists (select 1 from public.attendance_answers a where a.event_id = p.eid and a.user_id = p.uid)
    and not exists (select 1 from public.reminder_prefs rp where rp.user_id = p.uid and not rp.enabled)
    and not exists (select 1 from public.reminder_log l where l.event_id = p.eid and l.user_id = p.uid and (l.kind = p.k or l.kind = 'last'))
  order by p.uid, e.starts_at;
end
$$;

-- The server function marks what it sent.
create function public.reminders_mark_sent(p_user uuid, p_events uuid[], p_kind text) returns void
language sql security definer set search_path = '' as $$
  insert into public.reminder_log (user_id, event_id, kind)
  select p_user, e, p_kind from unnest(p_events) e
  on conflict do nothing
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.reminder_prefs, public.reminder_log from public, anon, authenticated;
revoke all on function public.set_reminders(boolean), public.reminders_due(timestamptz),
  public.reminders_mark_sent(uuid, uuid[], text) from public, anon, authenticated;

grant select on public.reminder_prefs to authenticated;
grant execute on function public.set_reminders(boolean) to authenticated;
grant execute on function public.reminders_due(timestamptz), public.reminders_mark_sent(uuid, uuid[], text) to service_role;

alter table public.reminder_prefs enable row level security;
alter table public.reminder_log enable row level security;

create policy reminder_prefs_select on public.reminder_prefs for select to authenticated
  using (user_id = (select auth.uid()));
-- reminder_log has no policies on purpose: only the server function and the database read it.
