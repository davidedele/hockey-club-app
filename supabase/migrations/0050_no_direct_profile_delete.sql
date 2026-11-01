-- No direct delete of a profile row (decision 121). A profile delete erases the person's whole history through
-- the cascades (answers, attendance, game numbers, ratings, votes, line-ups, messages) and leaves the sign in
-- account untouched. Migration 0001 granted it to the signed in role with the policy profiles_delete, and
-- nothing took it back. From now on a member's data is removed only through delete_member_data (security
-- definer, board only, keeps the history under the name "Utente Eliminato") and the delete-member function.

revoke delete on public.profiles from authenticated;
drop policy profiles_delete on public.profiles;
