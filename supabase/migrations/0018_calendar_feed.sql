-- Calendar feed: every member has one private link that phone calendars subscribe to.
-- The link holds a secret token. Only the person reads their own token, and a new token replaces
-- the old one at once. The server function that builds the feed (service role) looks the person up
-- by token and gets the events that person can see: the events of their groups, or all events for
-- coaches and the board. Nothing about other people is returned.

create table public.calendar_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token text not null unique check (length(token) = 64),
  created_at timestamptz not null default now()
);

-- The person's own token, created on first use.
create function public.my_calendar_token() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select token into v_token from public.calendar_tokens where user_id = auth.uid();
  if v_token is null then
    insert into public.calendar_tokens (user_id, token)
    values (auth.uid(), replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
    on conflict (user_id) do nothing;
    select token into v_token from public.calendar_tokens where user_id = auth.uid();
  end if;
  return v_token;
end
$$;

-- A new token. The old link stops working.
create function public.new_calendar_token() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.calendar_tokens (user_id, token) values (auth.uid(), v_token)
  on conflict (user_id) do update set token = excluded.token, created_at = now();
  return v_token;
end
$$;

-- The events of the person who owns the token: from 60 days ago onward. An unknown token gives
-- nothing. Called only by the server function.
create function public.calendar_events(p_token text)
returns table (
  id uuid,
  type public.event_type,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  meetup_at timestamptz,
  venue text,
  rink text,
  opponent text,
  home_away text,
  cancelled_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid;
  v_staff boolean;
begin
  select user_id into v_user from public.calendar_tokens where token = p_token;
  if v_user is null then
    return;
  end if;
  v_staff := exists (
    select 1 from public.user_roles where user_id = v_user and role in ('coach', 'board')
  );
  return query
  select e.id, e.type, e.title, e.starts_at, e.ends_at, e.meetup_at, e.venue, r.name,
         e.opponent, e.home_away, e.cancelled_at
  from public.events e
  left join public.rinks r on r.id = e.rink_id
  where e.starts_at >= now() - interval '60 days'
    and (
      v_staff
      or exists (
        select 1 from public.event_groups eg
        join public.group_members gm on gm.group_id = eg.group_id
        where eg.event_id = e.id and gm.user_id = v_user
      )
    )
  order by e.starts_at;
end
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.calendar_tokens from public, anon, authenticated;
revoke all on function public.my_calendar_token(), public.new_calendar_token(),
  public.calendar_events(text) from public, anon, authenticated;

grant select on public.calendar_tokens to authenticated;
grant execute on function public.my_calendar_token(), public.new_calendar_token() to authenticated;
grant execute on function public.calendar_events(text) to service_role;

alter table public.calendar_tokens enable row level security;

create policy calendar_tokens_select on public.calendar_tokens for select to authenticated
  using (user_id = (select auth.uid()));
