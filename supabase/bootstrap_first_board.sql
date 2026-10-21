-- One time step for the TEST project, run in the Supabase SQL editor.
-- 1. Create the first user in Authentication > Users (confirm the email).
-- 2. Replace the three values below, then run this script.
-- It creates the profile, the contact row and the board role for that user.
do $$
declare
  v_email text := 'REPLACE_WITH_EMAIL';
  v_first text := 'REPLACE_FIRST_NAME';
  v_last text := 'REPLACE_LAST_NAME';
  v_id uuid;
begin
  select id into v_id from auth.users where email = v_email;
  if v_id is null then
    raise exception 'No user with that email. Create it in Authentication first.';
  end if;
  insert into public.profiles (id, first_name, last_name) values (v_id, v_first, v_last)
    on conflict (id) do nothing;
  insert into public.profile_contacts (user_id, email) values (v_id, v_email)
    on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role) values (v_id, 'board')
    on conflict do nothing;
end $$;
