-- Team invite links: one link for a whole group, usable by many people until it expires, fills up
-- or the board switches it off. Single use invites stay as they are. Only the board makes team
-- links. The link itself is shown once when it is made, since only its hash is kept.

alter table public.invites
  add column max_uses smallint not null default 1 check (max_uses between 1 and 200),
  add column use_count smallint not null default 0;
update public.invites set use_count = 1 where used_at is not null;
alter table public.invites add constraint invites_use_count_max check (use_count <= max_uses);

create function public.create_team_invite(
  p_group_id smallint,
  p_days integer default 30,
  p_max_uses integer default 100
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_board() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 90 or p_max_uses is null or p_max_uses < 2 or p_max_uses > 200 then
    raise exception 'team_invite_invalid' using errcode = 'P0001';
  end if;
  insert into public.invites (group_id, token_hash, created_by, expires_at, max_uses)
  values (p_group_id, sha256(convert_to(v_token, 'utf8')), auth.uid(), now() + make_interval(days => p_days), p_max_uses);
  return v_token;
end
$$;

-- Same as before, now counting uses. A person who is already in the group does not use up a team
-- link. A team link is full when its uses reach the limit.
create or replace function public.redeem_invite(
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
     or v_invite.expires_at <= now() or v_invite.use_count >= v_invite.max_uses then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;

  if v_invite.max_uses > 1 and exists (
    select 1 from public.group_members where group_id = v_invite.group_id and user_id = v_uid
  ) then
    return v_invite.group_id;
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

  update public.invites set
    use_count = use_count + 1,
    used_at = case when use_count + 1 >= max_uses then now() end,
    used_by = case when max_uses = 1 then v_uid end
  where id = v_invite.id;
  return v_invite.group_id;
end
$$;

-- Privileges -----------------------------------------------------------

revoke all on function public.create_team_invite(smallint, integer, integer) from public, anon, authenticated;
grant execute on function public.create_team_invite(smallint, integer, integer) to authenticated;
