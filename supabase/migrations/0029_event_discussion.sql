-- A discussion thread for each event. People who see the event read it and write in it.
-- Messages are written only through post_event_message. A thread with no message for 15 days counts
-- as archived, which is worked out when it is read; a new message opens it again.

create table public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index event_messages_event_id_idx on public.event_messages (event_id, created_at);
create index event_messages_user_id_idx on public.event_messages (user_id);

-- Up to when a person has read an event's thread. A message is read when it is not newer than this.
create table public.event_message_seen (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_message_seen_user_id_idx on public.event_message_seen (user_id);

-- Write a message. Anyone who sees the event may, and the sender has read it up to this message.
create function public.post_event_message(p_event_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) or not public.can_see_event(p_event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(v_body) = 0 then
    raise exception 'message_empty' using errcode = 'P0001';
  end if;
  if length(v_body) > 1000 then
    raise exception 'message_too_long' using errcode = 'P0001';
  end if;
  -- The real clock, so a message and a read mark made one after the other never tie.
  insert into public.event_messages (event_id, user_id, body, created_at)
  values (p_event_id, auth.uid(), v_body, clock_timestamp())
  returning id into v_id;
  insert into public.event_message_seen (event_id, user_id, seen_at)
  values (p_event_id, auth.uid(), clock_timestamp())
  on conflict (event_id, user_id) do update set seen_at = clock_timestamp();
  return v_id;
end
$$;

-- The person has read the thread now.
create function public.mark_event_seen(p_event_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) or not public.can_see_event(p_event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.event_message_seen (event_id, user_id, seen_at)
  values (p_event_id, auth.uid(), clock_timestamp())
  on conflict (event_id, user_id) do update set seen_at = clock_timestamp();
end
$$;

-- The threads the person can see, with how many messages are new to them and whether the thread is archived.
create function public.my_event_threads()
returns table (
  event_id uuid,
  last_message_at timestamptz,
  messages bigint,
  unread bigint,
  archived boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select m.event_id,
         max(m.created_at),
         count(*),
         count(*) filter (where m.user_id <> auth.uid() and (s.seen_at is null or m.created_at > s.seen_at)),
         max(m.created_at) < now() - interval '15 days'
  from public.event_messages m
  left join public.event_message_seen s on s.event_id = m.event_id and s.user_id = auth.uid()
  where public.can_see_event(m.event_id)
  group by m.event_id;
end
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.event_messages, public.event_message_seen from public, anon, authenticated;
revoke all on function public.post_event_message(uuid, text), public.mark_event_seen(uuid), public.my_event_threads()
  from public, anon, authenticated;
grant execute on function public.post_event_message(uuid, text), public.mark_event_seen(uuid), public.my_event_threads()
  to authenticated;
grant select on public.event_messages, public.event_message_seen to authenticated;
grant delete on public.event_messages to authenticated;

alter table public.event_messages enable row level security;
alter table public.event_message_seen enable row level security;

-- Everyone who sees the event reads its thread and who has read it.
create policy event_messages_select on public.event_messages for select to authenticated
  using (public.can_see_event(event_id));
-- A person removes their own message, and staff remove any.
create policy event_messages_delete on public.event_messages for delete to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy event_message_seen_select on public.event_message_seen for select to authenticated
  using (public.can_see_event(event_id));
