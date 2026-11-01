-- Apply migration 0051 (scrub_deleted_account) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0051 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regclass('public.profiles') is not null and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_delete')) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0051 was not applied.';
  end if;
  if to_regprocedure('public.scrub_deleted_account(uuid)') is not null then
    raise exception 'Migration 0051 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Scrub the sign in account of a deleted member (decision 122). The delete-member function disables the account
-- (new email, random password, ban) and asks Supabase to clear the sign up data, but the admin update call only
-- merges metadata, so the names typed at sign up and the original email stayed in auth.users.raw_user_meta_data
-- and in auth.identities.identity_data. This function empties both, for that one person only:
--   1. auth.users.raw_user_meta_data becomes an empty object;
--   2. auth.identities.identity_data keeps only sub, the unusable email and email_verified.
-- Only the board can call it, and only for a person whose data was already deleted by delete_member_data, so it
-- can never touch a live member. Safe to run again.

create function public.scrub_deleted_account(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_board() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and deleted_at is not null) then
    raise exception 'not_deleted' using errcode = 'P0001';
  end if;

  update auth.users set raw_user_meta_data = '{}'::jsonb where id = p_user;
  update auth.identities
     set identity_data = jsonb_build_object(
           'sub', coalesce(identity_data -> 'sub', to_jsonb(p_user::text)),
           'email', 'deleted-' || p_user::text || '@deleted.invalid',
           'email_verified', coalesce(identity_data -> 'email_verified', 'false'::jsonb))
   where user_id = p_user;
end
$$;

revoke all on function public.scrub_deleted_account(uuid) from public, anon, authenticated;
grant execute on function public.scrub_deleted_account(uuid) to authenticated;

commit;
