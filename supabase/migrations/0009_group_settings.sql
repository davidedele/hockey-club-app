-- Settings per group, set by the board: game day colours, a picture and the default weekly training limit.
-- Colours left empty fall back to the club colours.
alter table public.groups
  add column game_dark text check (game_dark ~ '^#[0-9a-fA-F]{6}$'),
  add column game_light text check (game_light ~ '^#[0-9a-fA-F]{6}$'),
  add column logo_path text check (logo_path is null or logo_path ~ '^group-[0-9]{1,5}-[0-9]{10,16}\.(png|jpg|webp)$'),
  add column weekly_limit smallint check (weekly_limit between 1 and 14);

-- Only the columns the board edits can be changed, never the id.
revoke update on public.groups from authenticated;
grant update (code, name, game_dark, game_light, logo_path, weekly_limit) on public.groups to authenticated;

-- Group pictures live in the public club bucket. Only the board may add or remove them.
create policy group_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'club' and name like 'group-%' and public.is_board());
create policy group_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'club' and name like 'group-%' and public.is_board());

-- Coaches keep the club logo, but group pictures are for the board only.
alter policy club_files_insert on storage.objects
  with check (bucket_id = 'club' and name like 'logo-%' and public.is_staff());
alter policy club_files_update on storage.objects
  using (bucket_id = 'club' and name like 'logo-%' and public.is_staff())
  with check (bucket_id = 'club' and name like 'logo-%' and public.is_staff());
alter policy club_files_delete on storage.objects
  using (bucket_id = 'club' and name like 'logo-%' and public.is_staff());
