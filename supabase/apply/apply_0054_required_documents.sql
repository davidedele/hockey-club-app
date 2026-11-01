-- Apply migration 0054 (required_documents) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0054 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_settings' and column_name = 'mfa_required_from')) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0054 was not applied.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_settings' and column_name = 'certificate_months') then
    raise exception 'Migration 0054 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- What members must provide, phase 1 (decision 132, fix brief 3 D6). The two requirements stay as they are, but their
-- parts are settings of the club, changed by the board only:
--   certificate_months   how many months a certificate stays valid after its date of issue (12 by default)
--   certificate_review   whether staff must confirm the date after opening the file (on by default). Off: a date
--                        typed by the member counts at once and starts the reminders.
--   consent_mode         'button' (Accetto) or 'tick' (a tick box after opening the notice) for the privacy consent;
--                        the date of acceptance is stored as before.
-- A change applies to certificates entered afterwards; an existing certificate keeps its end date until its date of
-- issue is edited. The old rule "end date is exactly one year" is replaced by "the end date is after the date of issue".

alter table public.club_settings
  add column certificate_months integer not null default 12 check (certificate_months between 1 and 36),
  add column certificate_review boolean not null default true,
  add column consent_mode text not null default 'button' check (consent_mode in ('button', 'tick'));
grant update (certificate_months, certificate_review, consent_mode) on public.club_settings to authenticated;

alter table public.member_documents drop constraint member_documents_one_year;
alter table public.member_documents
  add constraint member_documents_end_after_issue check (issued_on is null or valid_until > issued_on) not valid;

create or replace function public.stamp_member_document() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_months integer := coalesce((select cs.certificate_months from public.club_settings cs limit 1), 12);
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
    -- The end date is the date of issue plus the months the club set. A change of the setting reaches certificates
    -- entered afterwards; an existing one keeps its end date until its date of issue is edited (decision 132).
    if tg_op = 'INSERT' or new.issued_on is distinct from old.issued_on or old.valid_until is null then
      new.valid_until := (new.issued_on + make_interval(months => v_months))::date;
    else
      new.valid_until := old.valid_until;
    end if;
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
    and (d.issued_source = 'read' or d.verified_at is not null
         or not coalesce((select cs.certificate_review from public.club_settings cs limit 1), true))
    and s.stage is not null
    and exists (select 1 from public.group_members gm where gm.user_id = pr.id)
    and not exists (select 1 from public.reminder_prefs rp where rp.user_id = pr.id and not rp.enabled)
    and not exists (
      select 1 from public.certificate_log l
      where l.user_id = pr.id and l.valid_until = d.valid_until and l.stage = s.stage)
  order by pr.id;
end
$$;

commit;
