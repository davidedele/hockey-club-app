-- The club's name, logo and colours are the club's identity, so the board sets them, like the groups.
alter policy club_settings_update on public.club_settings
  using (public.is_board()) with check (public.is_board());
alter policy club_files_insert on storage.objects
  with check (bucket_id = 'club' and name like 'logo-%' and public.is_board());
alter policy club_files_update on storage.objects
  using (bucket_id = 'club' and name like 'logo-%' and public.is_board())
  with check (bucket_id = 'club' and name like 'logo-%' and public.is_board());
alter policy club_files_delete on storage.objects
  using (bucket_id = 'club' and name like 'logo-%' and public.is_board());
