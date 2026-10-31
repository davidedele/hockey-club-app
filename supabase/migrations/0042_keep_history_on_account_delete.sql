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
