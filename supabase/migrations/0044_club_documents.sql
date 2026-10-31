-- Club documents (V3): the statutes, the league rules, forms and the like, uploaded by the board as PDF
-- files and read by every member. The files sit in the private bucket "documents", folder "club", next to
-- the privacy notice (club/doc-<time>.pdf). The list below holds the titles. Members read; only the board
-- adds, renames and removes. Signed out visitors and accounts without a profile read nothing.

create table public.club_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 80),
  file_path text not null unique check (file_path ~ '^club/doc-[0-9]{10,16}\.pdf$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index club_documents_created_by_idx on public.club_documents (created_by);

revoke all on public.club_documents from public, anon, authenticated;
grant select on public.club_documents to authenticated;
grant insert (title, file_path, created_by) on public.club_documents to authenticated;
grant update (title) on public.club_documents to authenticated;
grant delete on public.club_documents to authenticated;

alter table public.club_documents enable row level security;
create policy club_documents_select on public.club_documents for select to authenticated
  using ((select public.is_member()));
create policy club_documents_insert on public.club_documents for insert to authenticated
  with check ((select public.is_board()) and created_by = (select auth.uid()));
create policy club_documents_update on public.club_documents for update to authenticated
  using ((select public.is_board())) with check ((select public.is_board()));
create policy club_documents_delete on public.club_documents for delete to authenticated
  using ((select public.is_board()));

-- The board may add and remove these files; members already read the folder "club".
alter policy documents_insert on storage.objects with check (bucket_id = 'documents' and (
    public.can_manage_documents_of(split_part(name, '/', 1))
    or ((name like 'club/privacy-%' or name ~ '^club/doc-[0-9]{10,16}\.pdf$') and public.is_board())
  ));
alter policy documents_delete on storage.objects using (bucket_id = 'documents' and (
    public.can_manage_documents_of(split_part(name, '/', 1))
    or ((name like 'club/privacy-%' or name ~ '^club/doc-[0-9]{10,16}\.pdf$') and public.is_board())
  ));
