-- Club name, logo and game day colours. Staff set them in the app, so nothing about one club is built in.
-- One row only: the primary key can only be true.
create table public.club_settings (
  id boolean primary key default true check (id),
  name text not null default 'Hockey Club' check (length(trim(name)) between 1 and 60),
  logo_path text check (logo_path is null or logo_path ~ '^logo-[0-9]{10,16}\.(png|jpg|webp)$'),
  game_dark text not null default '#111111' check (game_dark ~ '^#[0-9a-fA-F]{6}$'),
  game_light text not null default '#ffd400' check (game_light ~ '^#[0-9a-fA-F]{6}$')
);
insert into public.club_settings default values;

alter table public.club_settings enable row level security;
revoke all on public.club_settings from public, anon, authenticated;
-- Everyone may read it: the name and logo also show on the sign in page.
grant select on public.club_settings to anon, authenticated;
grant update (name, logo_path, game_dark, game_light) on public.club_settings to authenticated;
create policy club_settings_select on public.club_settings for select to anon, authenticated using (true);
create policy club_settings_update on public.club_settings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Logo files: public to view, only staff may upload, replace or remove. At most 1 MB, PNG, JPEG or WebP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club', 'club', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
-- Deleting needs the rows to be visible, so the club files are readable by everyone (the bucket is public anyway).
create policy club_files_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'club');
create policy club_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'club' and public.is_staff());
create policy club_files_update on storage.objects for update to authenticated
  using (bucket_id = 'club' and public.is_staff()) with check (bucket_id = 'club' and public.is_staff());
create policy club_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'club' and public.is_staff());
