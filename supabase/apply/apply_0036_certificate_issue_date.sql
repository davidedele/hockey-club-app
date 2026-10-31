-- Apply migration 0036 (certificate_issue_date) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0036 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regclass('public.profiles') is not null and to_regclass('public.member_documents') is not null and to_regprocedure('public.certificates_due(timestamptz)') is not null) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0036 was not applied.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'member_documents' and column_name = 'issued_on') then
    raise exception 'Migration 0036 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- The medical certificate follows its date of issue (decisions 94, 105).
--
-- A valid certificate needs an uploaded file, a date of issue that was read from it (or typed by the
-- member and then confirmed by staff after opening the file), and it is valid until one year after
-- the date of issue. Nobody types the end date any more: it is worked out here.
--
-- New columns:
--   issued_on     the date of issue written on the certificate
--   issued_source 'read' when the reader found it in the photo, 'typed' when the member entered it
--   verified_at, verified_by   set only by verify_certificate(), when staff opened the file and confirmed
--
-- Old rows (a date typed by the member, with or without a file) are kept as they are. The new checks
-- are "not valid", so old rows are not tested and the migration cannot fail on them; only new and
-- changed rows are. Old rows with a file count as "to verify"; old rows without a file count as missing.
-- The query that finds the old rows:
--   select user_id from public.member_documents
--   where kind = 'medical_certificate' and valid_until is not null and (issued_on is null or file_path is null);

alter table public.member_documents
  add column issued_on date,
  add column issued_source text check (issued_source in ('read', 'typed')),
  add column verified_at timestamptz,
  add column verified_by uuid references public.profiles (id) on delete set null;
create index member_documents_verified_by_idx on public.member_documents (verified_by);

-- A date needs a file; the end date is the issue date plus one year; the source goes with the date;
-- the consent carries none of this.
alter table public.member_documents
  add constraint member_documents_date_needs_file
    check (kind <> 'medical_certificate' or (valid_until is null and issued_on is null) or file_path is not null) not valid,
  add constraint member_documents_one_year
    check (issued_on is null or valid_until = (issued_on + interval '1 year')::date) not valid,
  add constraint member_documents_source_with_date
    check ((issued_on is null) = (issued_source is null)) not valid,
  add constraint member_documents_consent_plain
    check (kind = 'medical_certificate' or (issued_on is null and issued_source is null and verified_at is null)) not valid;

-- Who wrote a row, when, and what follows from the date of issue. Done here, never by the app.
create or replace function public.stamp_member_document() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Europe/Rome')::date;
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  if new.kind = 'privacy_consent' then
    new.accepted_at := now();
    return new;
  end if;

  if new.issued_on is not null then
    if new.issued_on > v_today + 1 then
      raise exception 'issued_on_future' using errcode = 'check_violation';
    end if;
    if new.issued_on < v_today - 1096 then
      raise exception 'issued_on_too_old' using errcode = 'check_violation';
    end if;
    new.valid_until := (new.issued_on + interval '1 year')::date;
  elsif tg_op = 'INSERT' then
    -- Nobody types an end date: without a date of issue there is none.
    new.valid_until := null;
    new.issued_source := null;
  elsif old.issued_on is not null then
    new.valid_until := null;
    new.issued_source := null;
  else
    -- An old row without a date of issue keeps the end date it had.
    new.valid_until := old.valid_until;
  end if;

  if tg_op = 'INSERT' then
    new.verified_at := null;
    new.verified_by := null;
  elsif (new.file_path is distinct from old.file_path or new.issued_on is distinct from old.issued_on)
        and new.verified_at is not distinct from old.verified_at then
    -- A new file or a new date has to be looked at again.
    new.verified_at := null;
    new.verified_by := null;
  end if;
  return new;
end
$$;

-- Staff open the file, then confirm or correct the date of issue. Not possible without a file.
create function public.verify_certificate(p_user uuid, p_issued_on date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.member_documents;
begin
  if not (select public.is_staff()) then
    raise exception 'staff only' using errcode = 'insufficient_privilege';
  end if;
  if p_issued_on is null then
    raise exception 'issued_on_missing' using errcode = 'check_violation';
  end if;
  select * into v_row from public.member_documents where user_id = p_user and kind = 'medical_certificate';
  if not found or v_row.file_path is null then
    raise exception 'certificate_file_missing' using errcode = 'check_violation';
  end if;
  update public.member_documents
     set issued_on = p_issued_on,
         issued_source = coalesce(issued_source, 'typed'),
         verified_at = clock_timestamp(),
         verified_by = auth.uid()
   where user_id = p_user and kind = 'medical_certificate';
end
$$;

-- Reminders only for a certificate with a file whose date of issue was read from it or confirmed by
-- staff. A date nobody checked does not start reminders.
create or replace function public.certificates_due(p_now timestamptz default now())
returns table (
  user_id uuid,
  email text,
  first_name text,
  valid_until date,
  stage smallint,
  days integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hour integer := extract(hour from p_now at time zone 'Europe/Rome');
  v_today date := (p_now at time zone 'Europe/Rome')::date;
begin
  if v_hour < 8 or v_hour >= 22 then
    return;
  end if;
  return query
  select pr.id, c.email, pr.first_name, d.valid_until, s.stage, (d.valid_until - v_today)
  from public.member_documents d
  join public.profiles pr on pr.id = d.user_id
  join public.profile_contacts c on c.user_id = pr.id
  cross join lateral (
    select (case
      when d.valid_until - v_today <= -30 then -30
      when d.valid_until - v_today <= 0 then 0
      when d.valid_until - v_today <= 7 then 7
      when d.valid_until - v_today <= 30 then 30
      when d.valid_until - v_today <= 60 then 60
    end)::smallint as stage
  ) s
  where d.kind = 'medical_certificate'
    and d.valid_until is not null
    and d.file_path is not null
    and d.issued_on is not null
    and (d.issued_source = 'read' or d.verified_at is not null)
    and s.stage is not null
    and exists (select 1 from public.group_members gm where gm.user_id = pr.id)
    and not exists (select 1 from public.reminder_prefs rp where rp.user_id = pr.id and not rp.enabled)
    and not exists (
      select 1 from public.certificate_log l
      where l.user_id = pr.id and l.valid_until = d.valid_until and l.stage = s.stage)
  order by pr.id;
end
$$;

-- Privileges: the end date and the verification are never written by the app directly.
revoke insert, update on public.member_documents from authenticated;
grant insert (user_id, kind, issued_on, issued_source, file_path, accepted_at) on public.member_documents to authenticated;
grant update (issued_on, issued_source, file_path, accepted_at) on public.member_documents to authenticated;

revoke all on function public.verify_certificate(uuid, date) from public, anon, authenticated;
grant execute on function public.verify_certificate(uuid, date) to authenticated;
revoke all on function public.certificates_due(timestamptz) from public, anon, authenticated;
grant execute on function public.certificates_due(timestamptz) to service_role;

commit;
