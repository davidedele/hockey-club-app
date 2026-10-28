-- Announcements per group. Coaches and the board write a short message for one or more groups.
-- Members of those groups read it in the app, and staff read all of them. The writer can ask for an
-- email too: the server function that sends the reminders sends it once to every member of the
-- groups, unless the person switched the club emails off (the same switch as the reminders).
-- A message cannot be edited, only deleted by its writer or the board. Nothing is sent between 22:00
-- and 08:00 Italian time, and a message older than three days is never sent by email.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 80),
  body text not null check (length(trim(body)) between 1 and 2000),
  email boolean not null default false,
  created_at timestamptz not null default now()
);
create index announcements_created_at_idx on public.announcements (created_at desc);
create index announcements_author_id_idx on public.announcements (author_id);

create table public.announcement_groups (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  group_id smallint not null references public.groups (id) on delete cascade,
  primary key (announcement_id, group_id)
);
create index announcement_groups_group_id_idx on public.announcement_groups (group_id);

-- When a person last opened the announcements, to show what is new.
create table public.announcement_seen (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null
);

-- Emails already sent, so nobody gets the same one twice.
create table public.announcement_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);
create index announcement_log_announcement_id_idx on public.announcement_log (announcement_id);

-- Staff see every announcement, members those for one of their groups.
create function public.can_see_announcement(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff() or exists (
    select 1 from public.announcement_groups ag
    join public.group_members gm on gm.group_id = ag.group_id
    where ag.announcement_id = p_id and gm.user_id = auth.uid()
  )
$$;

-- Staff write an announcement for the chosen groups.
create function public.post_announcement(
  p_title text,
  p_body text,
  p_group_ids smallint[],
  p_email boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_group_ids), 0) = 0
     or (select count(*) from public.groups where id = any (p_group_ids))
        <> (select count(distinct g) from unnest(p_group_ids) g) then
    raise exception 'groups_required' using errcode = 'P0001';
  end if;
  if p_title is null or length(trim(p_title)) not between 1 and 80
     or p_body is null or length(trim(p_body)) not between 1 and 2000 then
    raise exception 'announcement_invalid' using errcode = 'P0001';
  end if;
  insert into public.announcements (author_id, title, body, email)
  values (auth.uid(), trim(p_title), trim(p_body), coalesce(p_email, false))
  returning id into v_id;
  insert into public.announcement_groups (announcement_id, group_id)
    select v_id, g from (select distinct unnest(p_group_ids) g) x;
  return v_id;
end
$$;

-- A person marks everything as seen.
create function public.mark_announcements_seen() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.announcement_seen (user_id, seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = excluded.seen_at;
end
$$;

-- Who is due an email now, one row per person and announcement. Only the server function calls this.
create function public.announcements_due(p_now timestamptz default now())
returns table (
  user_id uuid,
  email text,
  first_name text,
  announcement_id uuid,
  title text,
  body text,
  author_name text,
  group_names text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hour integer := extract(hour from p_now at time zone 'Europe/Rome');
begin
  if v_hour < 8 or v_hour >= 22 then
    return;
  end if;
  return query
  select pr.id, c.email, pr.first_name, a.id, a.title, a.body,
         coalesce(au.first_name || ' ' || au.last_name, ''),
         (select string_agg(g.name, ', ' order by g.id) from public.announcement_groups ag
            join public.groups g on g.id = ag.group_id where ag.announcement_id = a.id)
  from public.announcements a
  join lateral (
    select distinct gm.user_id from public.announcement_groups ag
    join public.group_members gm on gm.group_id = ag.group_id
    where ag.announcement_id = a.id
  ) m on true
  join public.profiles pr on pr.id = m.user_id
  join public.profile_contacts c on c.user_id = pr.id
  left join public.profiles au on au.id = a.author_id
  where a.email
    and a.created_at > p_now - interval '3 days'
    and pr.id is distinct from a.author_id
    and not exists (select 1 from public.reminder_prefs rp where rp.user_id = pr.id and not rp.enabled)
    and not exists (select 1 from public.announcement_log l where l.announcement_id = a.id and l.user_id = pr.id)
  order by pr.id, a.created_at;
end
$$;

-- The server function marks what it sent.
create function public.announcements_mark_sent(p_user uuid, p_announcements uuid[]) returns void
language sql security definer set search_path = '' as $$
  insert into public.announcement_log (user_id, announcement_id)
  select p_user, a from unnest(p_announcements) a
  on conflict do nothing
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.announcements, public.announcement_groups, public.announcement_seen,
  public.announcement_log from public, anon, authenticated;
revoke all on function public.can_see_announcement(uuid), public.post_announcement(text, text, smallint[], boolean),
  public.mark_announcements_seen(), public.announcements_due(timestamptz),
  public.announcements_mark_sent(uuid, uuid[]) from public, anon, authenticated;

grant select, delete on public.announcements to authenticated;
grant select on public.announcement_groups, public.announcement_seen to authenticated;
grant execute on function public.can_see_announcement(uuid), public.post_announcement(text, text, smallint[], boolean),
  public.mark_announcements_seen() to authenticated;
grant execute on function public.announcements_due(timestamptz), public.announcements_mark_sent(uuid, uuid[]) to service_role;

alter table public.announcements enable row level security;
alter table public.announcement_groups enable row level security;
alter table public.announcement_seen enable row level security;
alter table public.announcement_log enable row level security;

create policy announcements_select on public.announcements for select to authenticated
  using (public.can_see_announcement(id));
create policy announcements_delete on public.announcements for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_board());
create policy announcement_groups_select on public.announcement_groups for select to authenticated
  using (public.can_see_announcement(announcement_id));
create policy announcement_seen_select on public.announcement_seen for select to authenticated
  using (user_id = (select auth.uid()));
-- announcement_log has no policies on purpose: only the server function and the database read it.
