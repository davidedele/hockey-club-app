-- Apply migration 0050 (no_direct_profile_delete) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0050 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regprocedure('public.season_leaders(integer)') is not null) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0050 was not applied.';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_delete') then
    raise exception 'Migration 0050 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- No direct delete of a profile row (decision 121). A profile delete erases the person's whole history through
-- the cascades (answers, attendance, game numbers, ratings, votes, line-ups, messages) and leaves the sign in
-- account untouched. Migration 0001 granted it to the signed in role with the policy profiles_delete, and
-- nothing took it back. From now on a member's data is removed only through delete_member_data (security
-- definer, board only, keeps the history under the name "Utente Eliminato") and the delete-member function.

revoke delete on public.profiles from authenticated;
drop policy profiles_delete on public.profiles;

commit;
