-- Profile pictures. Each person adds their own; only club members can see them.
-- The app shrinks the picture to 256 by 256 pixels and saves it as JPEG, which also drops photo metadata such as location.
alter table public.profiles add column avatar_path text
  check (avatar_path is null or avatar_path ~ ('^' || id::text || '/avatar-[0-9]{10,16}\.jpg$'));
grant update (avatar_path) on public.profiles to authenticated;

-- Private bucket: files are reached through short lived signed links, never a public address.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg'])
on conflict (id) do nothing;

-- Members see all pictures. Everyone writes only inside the folder named after their own id.
-- The board may remove any picture, for example one that should not be there.
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.is_member());
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_member() and split_part(name, '/', 1) = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (split_part(name, '/', 1) = auth.uid()::text or public.is_board()));
