-- Deleting a member's data (decision 96). The board runs delete_member_data(person) from the member's page.
-- In one transaction: the name becomes "Utente Eliminato"; the shirt number, position and photo path are
-- cleared; contact, documents, absences, calendar link, notification choices, phones, group memberships
-- and roles are removed; invites they made and not used are revoked. The club history (answers,
-- attendance, game numbers, ratings, line-ups, messages) stays attached to the anonymous profile, so
-- the season totals do not change. The files in storage and the sign in account are removed afterwards
-- by the server function delete-member, which holds the service key.

alter table public.profiles add column deleted_at timestamptz;

-- A person whose data was deleted is no longer a member, whatever happens to the account.
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and deleted_at is null)
$$;

-- A small record of what was done: when and by whom, and nothing about the person.
create table public.member_deletions (
  id bigint generated always as identity primary key,
  deleted_at timestamptz not null default now(),
  deleted_by uuid references public.profiles (id) on delete set null
);
create index member_deletions_deleted_by_idx on public.member_deletions (deleted_by);

create function public.delete_member_data(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not public.is_board() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = v_me then
    raise exception 'cannot_delete_self' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id = p_user and deleted_at is not null) then
    raise exception 'already_deleted' using errcode = 'P0001';
  end if;
  -- The last board member stays.
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'board')
     and not exists (select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
                     where ur.role = 'board' and ur.user_id <> p_user and pr.deleted_at is null) then
    raise exception 'last_board' using errcode = 'P0001';
  end if;

  update public.profiles
     set first_name = 'Utente', last_name = 'Eliminato', jersey_number = null, position = null,
         avatar_path = null, deleted_at = now()
   where id = p_user;

  delete from public.profile_contacts where user_id = p_user;
  delete from public.member_documents where user_id = p_user;
  delete from public.absence_periods where user_id = p_user;
  delete from public.calendar_tokens where user_id = p_user;
  delete from public.reminder_prefs where user_id = p_user;
  delete from public.reminder_log where user_id = p_user;
  delete from public.certificate_log where user_id = p_user;
  delete from public.announcement_seen where user_id = p_user;
  delete from public.announcement_log where user_id = p_user;
  delete from public.event_new_log where user_id = p_user;
  delete from public.event_change_log where user_id = p_user;
  delete from public.event_message_seen where user_id = p_user;
  delete from public.notification_prefs where user_id = p_user;
  delete from public.push_subscriptions where user_id = p_user;
  delete from public.group_members where user_id = p_user;
  delete from public.user_roles where user_id = p_user;
  update public.invites set revoked_at = now() where created_by = p_user and used_at is null and revoked_at is null;

  insert into public.member_deletions (deleted_by) values (v_me);
end
$$;

-- Privileges -----------------------------------------------------------

revoke all on public.member_deletions from public, anon, authenticated;
revoke all on function public.delete_member_data(uuid) from public, anon, authenticated;
grant select on public.member_deletions to authenticated;
grant execute on function public.delete_member_data(uuid) to authenticated;

alter table public.member_deletions enable row level security;
create policy member_deletions_select on public.member_deletions for select to authenticated
  using ((select public.is_board()));
