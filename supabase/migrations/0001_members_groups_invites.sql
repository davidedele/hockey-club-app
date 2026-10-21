-- Step 1: members, groups, roles and invites.
-- Row level security is on for every table. Players are the default; coach and board are roles.

create type public.app_role as enum ('coach', 'board');

-- Groups ---------------------------------------------------------------

create table public.groups (
  id smallint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z0-9]{1,4}$'),
  name text not null check (length(trim(name)) between 1 and 40)
);

insert into public.groups (code, name) values
  ('A', 'A'), ('B', 'B'), ('C1', 'C1'), ('C2', 'C2');

-- Members --------------------------------------------------------------
-- A profile exists only for people who joined with an invite. No profile means no access.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null check (length(trim(first_name)) between 1 and 60),
  last_name text not null check (length(trim(last_name)) between 1 and 60),
  jersey_number smallint check (jersey_number between 0 and 99),
  position text check (position in ('goalie', 'defence', 'forward')),
  created_at timestamptz not null default now()
);

-- Contact data is kept apart so that only the person and staff can read it.
create table public.profile_contacts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email text not null,
  phone text check (length(phone) <= 30)
);

create table public.group_members (
  group_id smallint not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_id_idx on public.group_members (user_id);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  primary key (user_id, role)
);

-- Invites: single use, one week, one group. Only the hash of the token is stored.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id smallint not null references public.groups (id) on delete cascade,
  token_hash bytea not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index invites_group_id_idx on public.invites (group_id);

-- Helpers used by the policies -----------------------------------------

create function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

create function public.has_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles where user_id = auth.uid() and role = p_role
  )
$$;

create function public.is_board() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('board')
$$;

-- Coaches and the board can run the roster. Only the board assigns roles.
create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('coach', 'board')
  )
$$;

-- The last board member cannot be removed, so the club cannot lock itself out.
create function public.keep_one_board() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'board' and not exists (
    select 1 from public.user_roles
    where role = 'board' and user_id <> old.user_id
  ) then
    raise exception 'last_board_member' using errcode = 'P0001';
  end if;
  return old;
end
$$;

create trigger user_roles_keep_one_board
  before delete on public.user_roles
  for each row execute function public.keep_one_board();

-- Invite functions -----------------------------------------------------

create function public.create_invite(p_group_id smallint) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.invites (group_id, token_hash, created_by)
  values (p_group_id, sha256(convert_to(v_token, 'utf8')), auth.uid());
  return v_token;
end
$$;

create function public.revoke_invite(p_invite_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.invites set revoked_at = now()
  where id = p_invite_id and used_at is null and revoked_at is null;
end
$$;

-- Called by a signed in person with a confirmed email. Creates the profile on the first
-- invite (names required), then adds the person to the invite's group.
create function public.redeem_invite(
  p_token text,
  p_first_name text default null,
  p_last_name text default null
) returns smallint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.invites;
  v_email text;
  v_confirmed timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select email, email_confirmed_at into v_email, v_confirmed
  from auth.users where id = v_uid;
  if v_confirmed is null then
    raise exception 'email_not_confirmed' using errcode = 'P0001';
  end if;

  select * into v_invite from public.invites
  where token_hash = sha256(convert_to(coalesce(p_token, ''), 'utf8'))
  for update;
  -- One message for every failure, so a guess learns nothing.
  if not found or v_invite.used_at is not null or v_invite.revoked_at is not null
     or v_invite.expires_at <= now() then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    if nullif(trim(coalesce(p_first_name, '')), '') is null
       or nullif(trim(coalesce(p_last_name, '')), '') is null then
      raise exception 'names_required' using errcode = 'P0001';
    end if;
    insert into public.profiles (id, first_name, last_name)
    values (v_uid, trim(p_first_name), trim(p_last_name));
    insert into public.profile_contacts (user_id, email) values (v_uid, v_email);
  end if;

  insert into public.group_members (group_id, user_id)
  values (v_invite.group_id, v_uid)
  on conflict do nothing;

  update public.invites set used_by = v_uid, used_at = now() where id = v_invite.id;
  return v_invite.group_id;
end
$$;

-- Privileges -----------------------------------------------------------
-- Supabase grants broadly by default, so start from nothing and grant what is needed.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.groups, public.group_members, public.profiles to authenticated;
grant select on public.profile_contacts, public.user_roles, public.invites to authenticated;
grant insert, update, delete on public.groups to authenticated;
grant insert, delete on public.group_members to authenticated;
grant insert, delete on public.user_roles to authenticated;
grant delete on public.profiles to authenticated;
grant update (first_name, last_name, jersey_number, position) on public.profiles to authenticated;
grant update (phone) on public.profile_contacts to authenticated;

grant execute on function
  public.is_member(), public.has_role(public.app_role), public.is_board(), public.is_staff(),
  public.create_invite(smallint), public.revoke_invite(uuid),
  public.redeem_invite(text, text, text)
  to authenticated;

-- Row level security ---------------------------------------------------

alter table public.groups enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.group_members enable row level security;
alter table public.user_roles enable row level security;
alter table public.invites enable row level security;

create policy groups_select on public.groups for select to authenticated
  using (public.is_member());
create policy groups_insert on public.groups for insert to authenticated
  with check (public.is_board());
create policy groups_update on public.groups for update to authenticated
  using (public.is_board()) with check (public.is_board());
create policy groups_delete on public.groups for delete to authenticated
  using (public.is_board());

create policy profiles_select on public.profiles for select to authenticated
  using (public.is_member());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_board());

create policy contacts_select on public.profile_contacts for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy contacts_update on public.profile_contacts for update to authenticated
  using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

create policy group_members_select on public.group_members for select to authenticated
  using (public.is_member());
create policy group_members_insert on public.group_members for insert to authenticated
  with check (public.is_staff());
create policy group_members_delete on public.group_members for delete to authenticated
  using (public.is_staff());

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check (public.is_board());
create policy user_roles_delete on public.user_roles for delete to authenticated
  using (public.is_board());

create policy invites_select on public.invites for select to authenticated
  using (public.is_staff());
