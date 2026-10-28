-- The sign in pages no longer show the club, so the club settings are for signed in people only.
revoke select on public.club_settings from anon;
alter policy club_settings_select on public.club_settings to authenticated using (true);
