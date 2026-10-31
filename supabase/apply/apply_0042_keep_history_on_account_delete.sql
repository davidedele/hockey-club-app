-- Apply migration 0042 (keep_history_on_account_delete) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0042 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_settings' and column_name = 'mfa_required_from')) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0042 was not applied.';
  end if;
  if exists (select 1 from pg_constraint where conname = 'profiles_id_fkey' and conrelid = 'public.profiles'::regclass and confdeltype = 'r') then
    raise exception 'Migration 0042 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Deleting a sign in account must never erase a member's history (decision 96). The profile was tied to the
-- account with "on delete cascade", and answers, attendance, game numbers, ratings, votes, line-ups and
-- messages are tied to the profile the same way, so removing the account removed all of them. Now the
-- account of a person who has a profile cannot be deleted at all: the delete is refused and nothing is
-- lost. The server function delete-member disables the account instead (new random password, unusable
-- email, empty sign up data, no two step factors, banned). Accounts without a profile (someone who signed
-- up and never joined) can still be deleted.
--
-- The constraint is replaced as "not valid": the rows already there are not checked again, and the
-- constraint still guards every later delete from auth.users.

alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete restrict not valid;

commit;
