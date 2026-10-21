-- Same rules as before, written so Postgres works out the caller once per query instead of once per row.
alter policy profiles_update on public.profiles
  using (id = (select auth.uid()) or (select public.is_staff()))
  with check (id = (select auth.uid()) or (select public.is_staff()));
alter policy contacts_select on public.profile_contacts
  using (user_id = (select auth.uid()) or (select public.is_staff()));
alter policy contacts_update on public.profile_contacts
  using (user_id = (select auth.uid()) or (select public.is_staff()))
  with check (user_id = (select auth.uid()) or (select public.is_staff()));
alter policy user_roles_select on public.user_roles
  using (user_id = (select auth.uid()) or (select public.is_staff()));
alter policy answers_select on public.attendance_answers
  using (user_id = (select auth.uid()) or (select public.is_staff()));
alter policy records_select on public.attendance_records
  using (user_id = (select auth.uid()) or (select public.is_staff()));

-- Indexes for the invite columns that point at members, so removing a member stays quick.
create index invites_created_by_idx on public.invites (created_by);
create index invites_used_by_idx on public.invites (used_by);
