-- Bureaucracy page of each member: the medical certificate and the privacy consent for now.
-- More kinds can be added to the enum later. The member, coaches and the board see all of it.

create type public.document_kind as enum ('medical_certificate', 'privacy_consent');

-- One row per member and kind.
-- medical_certificate: expiry date and the file (photo or PDF) in the private documents bucket.
-- privacy_consent: when the member accepted, and which version of the club's privacy notice.
create table public.member_documents (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.document_kind not null,
  valid_until date,
  file_path text,
  accepted_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind),
  check (
    (kind = 'medical_certificate' and accepted_at is null
      and (file_path is null
           or file_path ~ ('^' || user_id::text || '/medical_certificate-[0-9]{10,16}\.(pdf|jpg|png)$')))
    or (kind = 'privacy_consent' and valid_until is null and accepted_at is not null
      and (file_path is null or file_path ~ '^club/privacy-[0-9]{10,16}\.pdf$'))
  )
);
create index member_documents_updated_by_idx on public.member_documents (updated_by);

-- Who wrote a row and when is set here, never by the app. A consent always carries the moment it was given.
create function public.stamp_member_document() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  if new.kind = 'privacy_consent' then
    new.accepted_at := now();
  end if;
  return new;
end
$$;
create trigger member_documents_stamp
  before insert or update on public.member_documents
  for each row execute function public.stamp_member_document();

-- The club's privacy notice, a PDF the board uploads.
alter table public.club_settings add column privacy_notice_path text
  check (privacy_notice_path is null or privacy_notice_path ~ '^club/privacy-[0-9]{10,16}\.pdf$');
grant update (privacy_notice_path) on public.club_settings to authenticated;

-- Private bucket for certificates and the privacy notice, reached through short lived signed links.
-- A member's files sit in a folder named after their id; the notice sits in the folder club.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- A member's own folder, or staff on the folder of an existing member.
create function public.can_manage_documents_of(p_folder text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member() and (
    p_folder = auth.uid()::text
    or (public.is_staff() and exists (select 1 from public.profiles where id::text = p_folder))
  )
$$;

create policy documents_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (
    public.can_manage_documents_of(split_part(name, '/', 1))
    or (split_part(name, '/', 1) = 'club' and public.is_member())
  ));
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (
    public.can_manage_documents_of(split_part(name, '/', 1))
    or (name like 'club/privacy-%' and public.is_board())
  ));
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (
    public.can_manage_documents_of(split_part(name, '/', 1))
    or (name like 'club/privacy-%' and public.is_board())
  ));

-- Privileges -----------------------------------------------------------

revoke all on public.member_documents from public, anon, authenticated;
revoke all on function public.stamp_member_document(), public.can_manage_documents_of(text)
  from public, anon, authenticated;
grant execute on function public.can_manage_documents_of(text) to authenticated;

grant select, delete on public.member_documents to authenticated;
grant insert (user_id, kind, valid_until, file_path, accepted_at) on public.member_documents to authenticated;
grant update (valid_until, file_path, accepted_at) on public.member_documents to authenticated;

alter table public.member_documents enable row level security;

-- The member and staff read and keep the certificate. Only the member gives or withdraws their own consent.
create policy member_documents_select on public.member_documents for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy member_documents_insert on public.member_documents for insert to authenticated
  with check ((select public.is_member()) and (
    user_id = (select auth.uid())
    or ((select public.is_staff()) and kind <> 'privacy_consent')
  ));
create policy member_documents_update on public.member_documents for update to authenticated
  using (user_id = (select auth.uid()) or ((select public.is_staff()) and kind <> 'privacy_consent'))
  with check (user_id = (select auth.uid()) or ((select public.is_staff()) and kind <> 'privacy_consent'));
create policy member_documents_delete on public.member_documents for delete to authenticated
  using (user_id = (select auth.uid()) or ((select public.is_staff()) and kind <> 'privacy_consent'));
