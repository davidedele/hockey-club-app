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
