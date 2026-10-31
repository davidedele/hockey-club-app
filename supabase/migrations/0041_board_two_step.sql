-- Two step sign in for the board (decision 98). Everybody can enrol an authenticator app (Profilo,
-- Sicurezza). After the date in club_settings.mfa_required_from, board powers need a session that passed
-- the second step (the aal2 level of the token): a board member without it is treated as a plain member
-- until they sign in with the code. Coaches and players are not affected. With no date set, nothing is
-- required. The board can move or clear the date from the club settings.
--
-- To reset a board member who lost their phone: Supabase dashboard, Authentication, Users, the person,
-- Remove MFA factor (an owner of the project does this). Written down in docs/SETUP_2FA.md.

alter table public.club_settings add column mfa_required_from timestamptz default (now() + interval '30 days');
grant update (mfa_required_from) on public.club_settings to authenticated;

-- True while the second step is not required yet, or when this session passed it.
create function public.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select cs.mfa_required_from > now() from public.club_settings cs limit 1), true)
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create or replace function public.is_board() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('board') and public.mfa_ok()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and (role = 'coach' or (role = 'board' and public.mfa_ok()))
  )
$$;

revoke all on function public.mfa_ok() from public, anon, authenticated;
grant execute on function public.mfa_ok() to authenticated;
