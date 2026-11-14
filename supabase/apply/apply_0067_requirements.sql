-- Apply migration 0067 (requirements) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0067 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (to_regclass('public.club_requests') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'league_side')) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0067 was not applied.';
  end if;
  if to_regclass('public.requirements') is not null then
    raise exception 'Migration 0067 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- Required documents: one model for everything staff ask from players.
--
-- A requirement is a title, a reason, and a list of blocks that the player fills in: a text to read, a
-- checkbox (mandatory or optional), a date, a file upload. A requirement can ask for a reading file (a PDF
-- from the club), expire some months after a date block, wait for staff to confirm, apply to chosen
-- groups, and be visible to all staff or to the board only. Answers hold only ticks, dates and file paths:
-- players never type free text.
--
-- Content that a player saw is kept in versions. A "correction" changes only labels and texts of the
-- current version. A "new version" changes anything else, and every answer to an older version then counts
-- as outdated, while staying on record with the version it was given for.
--
-- The medical certificate, the privacy consent and the club requests of migration 0064 are copied into this
-- model by migration 0068. The old tables stay until the last step of the change.
--
-- Everything is written through the functions below. The signed in role can only read the tables.

-- A requirement's blocks. Called by a check constraint, so it never reads a table.
create function public.requirement_blocks_valid(p_blocks jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  b jsonb;
  v_ids text[] := '{}';
  v_type text;
  v_id text;
  v_label text;
  v_non_text integer := 0;
begin
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) not between 1 and 20 then
    return false;
  end if;
  for b in select value from jsonb_array_elements(p_blocks) loop
    if jsonb_typeof(b) <> 'object' then return false; end if;
    -- Only these keys exist.
    if exists (select 1 from jsonb_object_keys(b) k where k not in ('id', 'type', 'label', 'required', 'read_from_file')) then
      return false;
    end if;
    v_type := b ->> 'type';
    v_id := b ->> 'id';
    v_label := b ->> 'label';
    if v_type is null or v_type not in ('text', 'checkbox', 'date', 'file') then return false; end if;
    if v_id is null or v_id !~ '^[a-z0-9]{1,12}$' or v_id = any (v_ids) then return false; end if;
    v_ids := v_ids || v_id;
    if v_label is null or length(trim(v_label)) < 1 or length(v_label) > (case when v_type = 'text' then 2000 else 200 end) then
      return false;
    end if;
    if v_type = 'text' then
      -- A paragraph to read has no answer, so it is never mandatory.
      if b ? 'required' or b ? 'read_from_file' then return false; end if;
    else
      v_non_text := v_non_text + 1;
      if not (b ? 'required') or jsonb_typeof(b -> 'required') <> 'boolean' then return false; end if;
      if b ? 'read_from_file' and (v_type <> 'date' or jsonb_typeof(b -> 'read_from_file') <> 'boolean') then return false; end if;
    end if;
  end loop;
  -- At least one block that takes an answer.
  return v_non_text >= 1;
end
$$;

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  -- Set only for the two requirements the club had before: the certificate and the privacy consent.
  slug text unique check (slug in ('medical_certificate', 'privacy_consent')),
  title text not null check (length(trim(title)) between 1 and 80),
  reason text not null check (length(trim(reason)) between 1 and 500),
  -- No groups means everybody.
  group_ids smallint[] not null default '{}',
  deadline date,
  -- The id of the date block an end date counts from, and the months after it. Both or neither.
  expiry_block text,
  expiry_months integer check (expiry_months between 1 and 120),
  -- none: nobody confirms. always: staff confirm every answer. unless_read: staff confirm unless every date
  -- that is read from its file was found by the reader (how the certificate works today).
  review text not null default 'none' check (review in ('none', 'always', 'unless_read')),
  visibility text not null default 'staff' check (visibility in ('staff', 'board')),
  -- Shows the banner until done. Off: reminders only.
  blocking boolean not null default true,
  -- Staff may answer for a member (the certificate sent through another channel). Never for a consent.
  staff_can_submit boolean not null default false,
  active boolean not null default true,
  current_version integer not null default 1 check (current_version >= 1),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((expiry_block is null) = (expiry_months is null))
);
create index requirements_created_by_idx on public.requirements (created_by);

create table public.requirement_versions (
  requirement_id uuid not null references public.requirements (id) on delete restrict,
  -- Version 0 exists only for answers copied from an earlier privacy notice nobody can identify.
  version integer not null check (version >= 0),
  description text not null default '' check (length(description) <= 2000),
  -- A PDF in the club folder of the documents bucket (the library or the privacy notice).
  reading_path text check (reading_path ~ '^club/(doc|privacy)-[0-9]{10,16}\.pdf$'),
  blocks jsonb not null check (public.requirement_blocks_valid(blocks)),
  created_at timestamptz not null default now(),
  primary key (requirement_id, version)
);

create table public.requirement_answers (
  requirement_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  version integer not null,
  -- block id to true or false (checkbox), a date as text (date) or a storage path (file).
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  -- block id to 'read' or 'typed' for date blocks: whether the reader found the date in the file.
  sources jsonb not null default '{}' check (jsonb_typeof(sources) = 'object'),
  status text not null check (status in ('complete', 'pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  -- Worked out by the functions below from the date block and the months. Nobody types it.
  valid_until date,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_note text not null default '' check (length(review_note) <= 1000),
  primary key (requirement_id, user_id),
  foreign key (requirement_id, version) references public.requirement_versions (requirement_id, version) on delete restrict
);
create index requirement_answers_user_idx on public.requirement_answers (user_id);
create index requirement_answers_reviewer_idx on public.requirement_answers (reviewed_by);
create index requirement_answers_version_idx on public.requirement_answers (requirement_id, version);

-- Which reminder emails were sent for which end date, so each goes out once.
create table public.requirement_reminder_log (
  requirement_id uuid not null references public.requirements (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  valid_until date not null,
  stage smallint not null check (stage in (60, 30, 7, 0, -30)),
  sent_at timestamptz not null default now(),
  primary key (requirement_id, user_id, valid_until, stage)
);
create index requirement_reminder_log_user_idx on public.requirement_reminder_log (user_id);

-- Who can see what -----------------------------------------------------

-- Whether a requirement applies to a person: the requirement is for everybody or for one of their groups.
-- Anybody can ask about themselves; staff can ask about others; everybody else gets false.
create function public.requirement_applies(p_id uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select (p_user = auth.uid() or public.is_staff())
    and exists (select 1 from public.profiles pr where pr.id = p_user and pr.deleted_at is null)
    and exists (
      select 1 from public.requirements r
      where r.id = p_id
        and (cardinality(r.group_ids) = 0
             or exists (select 1 from public.group_members gm where gm.user_id = p_user and gm.group_id = any (r.group_ids)))
    )
$$;

-- Whether the signed in staff member may read the answers of a requirement: the board always, a coach only
-- when the requirement is not marked board only.
create function public.requirement_staff_sees(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_board()
    or (public.is_staff() and exists (select 1 from public.requirements r where r.id = p_id and r.visibility = 'staff'))
$$;

-- Whether the signed in member may read the requirement itself: staff, people it applies to, and people who
-- already answered it.
create function public.requirement_readable(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member() and (
    public.is_staff()
    or public.requirement_applies(p_id)
    or exists (select 1 from public.requirement_answers a where a.requirement_id = p_id and a.user_id = auth.uid())
  )
$$;

revoke all on public.requirements, public.requirement_versions, public.requirement_answers, public.requirement_reminder_log
  from public, anon, authenticated;
grant select on public.requirements, public.requirement_versions, public.requirement_answers to authenticated;
revoke all on function public.requirement_blocks_valid(jsonb), public.requirement_applies(uuid, uuid),
  public.requirement_staff_sees(uuid), public.requirement_readable(uuid) from public, anon, authenticated;
grant execute on function public.requirement_applies(uuid, uuid), public.requirement_staff_sees(uuid),
  public.requirement_readable(uuid) to authenticated;

alter table public.requirements enable row level security;
alter table public.requirement_versions enable row level security;
alter table public.requirement_answers enable row level security;
alter table public.requirement_reminder_log enable row level security;

create policy requirements_read on public.requirements for select to authenticated
  using ((select public.requirement_readable(id)));
create policy requirement_versions_read on public.requirement_versions for select to authenticated
  using ((select public.requirement_readable(requirement_id)));
create policy requirement_answers_read on public.requirement_answers for select to authenticated
  using (user_id = (select auth.uid()) or (select public.requirement_staff_sees(requirement_id)));

-- Writing a requirement (the board) --------------------------------------

-- Creates a requirement ('new'), or changes one: 'correction' changes only labels and texts of the current
-- version, 'version' makes a new version that every member has to answer again.
-- p_fields: title, reason, group_ids, deadline, expiry_block, expiry_months, review, visibility, blocking,
--           staff_can_submit, active (any left out keeps its value; a new one starts from the defaults).
-- p_content: description, reading_path, blocks (needed for 'new' and 'version'; for 'correction' it carries
--            the corrected description and labels).
create function public.save_requirement(p_id uuid, p_fields jsonb, p_content jsonb, p_mode text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.requirements;
  v_new public.requirements;
  v_cur public.requirement_versions;
  v_blocks jsonb;
  v_description text;
  v_reading text;
  v_groups smallint[];
  v_version integer;
  v_i integer;
begin
  if not public.is_board() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('new', 'correction', 'version') then
    raise exception 'requirement_mode_invalid' using errcode = 'P0001';
  end if;
  if (p_mode = 'new') <> (p_id is null) then
    raise exception 'requirement_mode_invalid' using errcode = 'P0001';
  end if;
  p_fields := coalesce(p_fields, '{}'::jsonb);

  if p_mode <> 'new' then
    select * into v_old from public.requirements where id = p_id for update;
    if not found then
      raise exception 'requirement_not_found' using errcode = 'P0001';
    end if;
    select * into v_cur from public.requirement_versions where requirement_id = p_id and version = v_old.current_version;
    v_new := v_old;
  else
    v_new.id := gen_random_uuid();
    v_new.slug := null;
    v_new.current_version := 1;
    v_new.created_by := auth.uid();
    v_new.created_at := now();
    v_new.group_ids := '{}';
    v_new.review := 'none';
    v_new.visibility := 'staff';
    v_new.blocking := true;
    v_new.staff_can_submit := false;
    v_new.active := true;
  end if;

  if p_fields ? 'title' then v_new.title := trim(p_fields ->> 'title'); end if;
  if p_fields ? 'reason' then v_new.reason := trim(p_fields ->> 'reason'); end if;
  if p_fields ? 'group_ids' then
    v_groups := array(select distinct value::smallint from jsonb_array_elements_text(p_fields -> 'group_ids') order by 1);
    if (select count(*) from public.groups where id = any (v_groups)) <> cardinality(v_groups) then
      raise exception 'requirement_groups_invalid' using errcode = 'P0001';
    end if;
    v_new.group_ids := v_groups;
  end if;
  if p_fields ? 'deadline' then v_new.deadline := (p_fields ->> 'deadline')::date; end if;
  if p_fields ? 'expiry_block' then v_new.expiry_block := nullif(p_fields ->> 'expiry_block', ''); end if;
  if p_fields ? 'expiry_months' then v_new.expiry_months := (p_fields ->> 'expiry_months')::integer; end if;
  if p_fields ? 'review' then v_new.review := p_fields ->> 'review'; end if;
  if p_fields ? 'visibility' then v_new.visibility := p_fields ->> 'visibility'; end if;
  if p_fields ? 'blocking' then v_new.blocking := (p_fields ->> 'blocking')::boolean; end if;
  if p_fields ? 'staff_can_submit' then v_new.staff_can_submit := (p_fields ->> 'staff_can_submit')::boolean; end if;
  if p_fields ? 'active' then v_new.active := (p_fields ->> 'active')::boolean; end if;

  -- The content the check below runs against.
  if p_mode = 'correction' then
    v_blocks := coalesce(p_content -> 'blocks', v_cur.blocks);
    v_description := coalesce(p_content ->> 'description', v_cur.description);
    v_reading := v_cur.reading_path;
    if p_content ? 'reading_path' and (p_content ->> 'reading_path') is distinct from v_cur.reading_path then
      raise exception 'requirement_correction_structure' using errcode = 'P0001';
    end if;
    -- A correction keeps the number, order, kind and mandatory flag of every block.
    if jsonb_typeof(v_blocks) <> 'array' or jsonb_array_length(v_blocks) <> jsonb_array_length(v_cur.blocks) then
      raise exception 'requirement_correction_structure' using errcode = 'P0001';
    end if;
    for v_i in 0 .. jsonb_array_length(v_cur.blocks) - 1 loop
      if (v_blocks -> v_i) - 'label' is distinct from (v_cur.blocks -> v_i) - 'label' then
        raise exception 'requirement_correction_structure' using errcode = 'P0001';
      end if;
    end loop;
  else
    if p_content is null or not (p_content ? 'blocks') then
      raise exception 'requirement_content_missing' using errcode = 'P0001';
    end if;
    v_blocks := p_content -> 'blocks';
    v_description := coalesce(p_content ->> 'description', '');
    v_reading := nullif(p_content ->> 'reading_path', '');
  end if;
  if not public.requirement_blocks_valid(v_blocks) then
    raise exception 'requirement_blocks_invalid' using errcode = 'P0001';
  end if;

  -- The end date counts from a date block of the content.
  if v_new.expiry_block is not null and not exists (
    select 1 from jsonb_array_elements(v_blocks) b where b ->> 'id' = v_new.expiry_block and b ->> 'type' = 'date'
  ) then
    raise exception 'requirement_expiry_invalid' using errcode = 'P0001';
  end if;
  -- "Unless read" only means something when a date can be read from a file.
  if v_new.review = 'unless_read' and not exists (
    select 1 from jsonb_array_elements(v_blocks) b where b ->> 'type' = 'date' and (b ->> 'read_from_file')::boolean
  ) then
    raise exception 'requirement_review_invalid' using errcode = 'P0001';
  end if;
  -- A consent is given by the person, never for them.
  if v_new.slug = 'privacy_consent' and v_new.staff_can_submit then
    raise exception 'requirement_staff_submit_invalid' using errcode = 'P0001';
  end if;

  if v_new.title is null or v_new.reason is null then
    raise exception 'requirement_fields_missing' using errcode = 'P0001';
  end if;

  if p_mode = 'new' then
    insert into public.requirements values (v_new.*);
    insert into public.requirement_versions (requirement_id, version, description, reading_path, blocks)
    values (v_new.id, 1, v_description, v_reading, v_blocks);
    return v_new.id;
  end if;

  if p_mode = 'correction' then
    update public.requirement_versions
       set description = v_description, blocks = v_blocks
     where requirement_id = p_id and version = v_old.current_version;
  else
    v_version := v_old.current_version + 1;
    insert into public.requirement_versions (requirement_id, version, description, reading_path, blocks)
    values (p_id, v_version, v_description, v_reading, v_blocks);
    v_new.current_version := v_version;
  end if;
  update public.requirements
     set title = v_new.title, reason = v_new.reason, group_ids = v_new.group_ids, deadline = v_new.deadline,
         expiry_block = v_new.expiry_block, expiry_months = v_new.expiry_months, review = v_new.review,
         visibility = v_new.visibility, blocking = v_new.blocking, staff_can_submit = v_new.staff_can_submit,
         active = v_new.active, current_version = v_new.current_version
   where id = p_id;
  return p_id;
end
$$;

-- Answering ------------------------------------------------------------

-- A member gives their answer to the current version of a requirement. Staff may give it for a member only
-- when the requirement allows it. A new answer replaces the old one only when that makes sense: there is
-- none, it was rejected, it is for an older version, or the requirement expires (a renewal).
create function public.submit_requirement(p_requirement uuid, p_user uuid, p_answers jsonb, p_sources jsonb default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_user uuid := coalesce(p_user, auth.uid());
  v_today date := (now() at time zone 'Europe/Rome')::date;
  r public.requirements;
  v public.requirement_versions;
  v_old public.requirement_answers;
  b jsonb;
  v_value jsonb;
  v_text text;
  v_date date;
  v_sources jsonb := '{}'::jsonb;
  v_answers jsonb := '{}'::jsonb;
  v_valid_until date;
  v_status text;
  v_all_read boolean := true;
begin
  if v_me is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  p_answers := coalesce(p_answers, '{}'::jsonb);
  p_sources := coalesce(p_sources, '{}'::jsonb);
  if jsonb_typeof(p_answers) <> 'object' or jsonb_typeof(p_sources) <> 'object' then
    raise exception 'requirement_answer_invalid' using errcode = 'P0001';
  end if;

  select * into r from public.requirements where id = p_requirement;
  if not found or not r.active then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_user <> v_me then
    if not public.is_staff() or not r.staff_can_submit or not public.requirement_staff_sees(p_requirement) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  if not public.requirement_applies(p_requirement, v_user) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v from public.requirement_versions where requirement_id = r.id and version = r.current_version;

  perform pg_advisory_xact_lock(hashtextextended(p_requirement::text || v_user::text, 0));
  select * into v_old from public.requirement_answers where requirement_id = r.id and user_id = v_user for update;
  if found and v_old.status <> 'rejected' and v_old.version = r.current_version and r.expiry_months is null then
    raise exception 'requirement_already_answered' using errcode = 'P0001';
  end if;

  -- Only blocks of the current version take an answer.
  if exists (
    select 1 from jsonb_object_keys(p_answers) k
    where not exists (select 1 from jsonb_array_elements(v.blocks) x where x ->> 'id' = k and x ->> 'type' <> 'text')
  ) then
    raise exception 'requirement_answer_unknown' using errcode = 'P0001';
  end if;

  for b in select value from jsonb_array_elements(v.blocks) loop
    if b ->> 'type' = 'text' then continue; end if;
    v_value := p_answers -> (b ->> 'id');
    if b ->> 'type' = 'checkbox' then
      if v_value is not null and jsonb_typeof(v_value) <> 'boolean' then
        raise exception 'requirement_answer_invalid' using errcode = 'P0001';
      end if;
      if (b ->> 'required')::boolean and coalesce(v_value, 'false'::jsonb) <> 'true'::jsonb then
        raise exception 'requirement_answer_required' using errcode = 'P0001';
      end if;
      v_answers := v_answers || jsonb_build_object(b ->> 'id', coalesce(v_value, 'false'::jsonb));
    elsif b ->> 'type' = 'date' then
      if v_value is null or v_value = 'null'::jsonb then
        if (b ->> 'required')::boolean then
          raise exception 'requirement_answer_required' using errcode = 'P0001';
        end if;
        continue;
      end if;
      if jsonb_typeof(v_value) <> 'string' or (v_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'requirement_answer_invalid' using errcode = 'P0001';
      end if;
      begin
        v_date := (v_value #>> '{}')::date;
      exception when others then
        raise exception 'requirement_answer_invalid' using errcode = 'P0001';
      end;
      if v_date < date '1900-01-01' or v_date > date '2100-01-01' then
        raise exception 'requirement_answer_invalid' using errcode = 'P0001';
      end if;
      -- The date an end date counts from is a date of issue: not in the future, not older than three years.
      if r.expiry_block = b ->> 'id' then
        if v_date > v_today + 1 then raise exception 'issued_on_future' using errcode = 'check_violation'; end if;
        if v_date < v_today - 1096 then raise exception 'issued_on_too_old' using errcode = 'check_violation'; end if;
        v_valid_until := (v_date + make_interval(months => r.expiry_months))::date;
      end if;
      v_answers := v_answers || jsonb_build_object(b ->> 'id', v_date::text);
      -- Whether the reader found the date: anything else counts as typed.
      v_text := case when p_sources ->> (b ->> 'id') = 'read' and coalesce((b ->> 'read_from_file')::boolean, false) then 'read' else 'typed' end;
      v_sources := v_sources || jsonb_build_object(b ->> 'id', v_text);
      if coalesce((b ->> 'read_from_file')::boolean, false) and v_text <> 'read' then v_all_read := false; end if;
    else
      if v_value is null or v_value = 'null'::jsonb then
        if (b ->> 'required')::boolean then
          raise exception 'requirement_answer_required' using errcode = 'P0001';
        end if;
        continue;
      end if;
      -- A file of the member's own folder, made for this requirement, that is really in the bucket.
      if jsonb_typeof(v_value) <> 'string'
         or (v_value #>> '{}') !~ ('^' || v_user::text || '/req-' || r.id::text || '-[a-f0-9-]{36}\.(pdf|jpg|png)$')
         or not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = v_value #>> '{}') then
        raise exception 'requirement_file_invalid' using errcode = 'P0001';
      end if;
      v_answers := v_answers || jsonb_build_object(b ->> 'id', v_value);
    end if;
  end loop;

  v_status := case
    when r.review = 'always' then 'pending'
    when r.review = 'unless_read' and not v_all_read then 'pending'
    else 'complete'
  end;

  insert into public.requirement_answers (requirement_id, user_id, version, answers, sources, status, valid_until)
  values (r.id, v_user, r.current_version, v_answers, v_sources, v_status, v_valid_until)
  on conflict (requirement_id, user_id) do update
    set version = excluded.version, answers = excluded.answers, sources = excluded.sources, status = excluded.status,
        valid_until = excluded.valid_until, submitted_at = now(), reviewed_at = null, reviewed_by = null, review_note = '';
end
$$;

-- Staff open the answer, then approve or reject it. When approving they may correct a date (block id to date),
-- and the end date is worked out again. Only answers that wait or that were not checked can be reviewed.
create function public.review_requirement_answer(
  p_requirement uuid, p_user uuid, p_approve boolean, p_note text default '', p_dates jsonb default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.requirements;
  v_answer public.requirement_answers;
  v_key text;
  v_date date;
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_answers jsonb;
  v_valid_until date;
begin
  if not public.is_staff() or p_approve is null or not public.requirement_staff_sees(p_requirement) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into r from public.requirements where id = p_requirement;
  select * into v_answer from public.requirement_answers
   where requirement_id = p_requirement and user_id = p_user for update;
  if not found or v_answer.status not in ('pending', 'complete') or v_answer.version <> r.current_version then
    raise exception 'request_review_changed' using errcode = 'P0001';
  end if;

  v_answers := v_answer.answers;
  v_valid_until := v_answer.valid_until;
  if p_approve and p_dates is not null then
    if jsonb_typeof(p_dates) <> 'object' then
      raise exception 'requirement_answer_invalid' using errcode = 'P0001';
    end if;
    for v_key in select jsonb_object_keys(p_dates) loop
      if not exists (
        select 1 from public.requirement_versions v, jsonb_array_elements(v.blocks) b
        where v.requirement_id = r.id and v.version = r.current_version and b ->> 'id' = v_key and b ->> 'type' = 'date'
      ) then
        raise exception 'requirement_answer_unknown' using errcode = 'P0001';
      end if;
      begin
        v_date := (p_dates ->> v_key)::date;
      exception when others then
        raise exception 'requirement_answer_invalid' using errcode = 'P0001';
      end;
      if r.expiry_block = v_key then
        if v_date > v_today + 1 then raise exception 'issued_on_future' using errcode = 'check_violation'; end if;
        if v_date < v_today - 1096 then raise exception 'issued_on_too_old' using errcode = 'check_violation'; end if;
        v_valid_until := (v_date + make_interval(months => r.expiry_months))::date;
      end if;
      v_answers := v_answers || jsonb_build_object(v_key, v_date::text);
    end loop;
  end if;

  update public.requirement_answers
     set status = case when p_approve then 'approved' else 'rejected' end,
         answers = v_answers, valid_until = v_valid_until,
         reviewed_at = now(), reviewed_by = auth.uid(), review_note = coalesce(p_note, '')
   where requirement_id = p_requirement and user_id = p_user;
end
$$;

-- A member takes back their own answer (a consent can always be withdrawn). The files are removed by the app.
create function public.withdraw_requirement_answer(p_requirement uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.requirement_answers where requirement_id = p_requirement and user_id = auth.uid();
  if not found then
    raise exception 'requirement_answer_missing' using errcode = 'P0001';
  end if;
end
$$;

revoke all on function public.save_requirement(uuid, jsonb, jsonb, text),
  public.submit_requirement(uuid, uuid, jsonb, jsonb),
  public.review_requirement_answer(uuid, uuid, boolean, text, jsonb),
  public.withdraw_requirement_answer(uuid) from public, anon, authenticated;
grant execute on function public.save_requirement(uuid, jsonb, jsonb, text),
  public.submit_requirement(uuid, uuid, jsonb, jsonb),
  public.review_requirement_answer(uuid, uuid, boolean, text, jsonb),
  public.withdraw_requirement_answer(uuid) to authenticated;

-- Files ----------------------------------------------------------------

-- A file named <member>/req-<requirement>-<id>.<ext> follows the visibility of its requirement: staff other
-- than the board cannot open it when the requirement is board only. Older files keep the old rule.
create function public.requirement_file_visible(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_name ~ '^[^/]+/req-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-'
    then public.is_board() or not exists (
      select 1 from public.requirements r
      where r.id = substring(p_name from '^[^/]+/req-([0-9a-f-]{36})-')::uuid and r.visibility = 'board')
    else true
  end
$$;
revoke all on function public.requirement_file_visible(text) from public, anon, authenticated;
grant execute on function public.requirement_file_visible(text) to authenticated;

-- A member's own folder always; the club folder for every member; another member's folder only for staff,
-- and only when the requirement of the file allows it.
alter policy documents_select on storage.objects using (bucket_id = 'documents' and (
  split_part(name, '/', 1) = (select auth.uid())::text
  or (split_part(name, '/', 1) = 'club' and public.is_member())
  or (public.can_manage_documents_of(split_part(name, '/', 1)) and public.requirement_file_visible(name))
));

-- Keep the evidence: a file that an answer still points to cannot be removed.
alter policy documents_delete on storage.objects using (bucket_id = 'documents' and (
  (public.can_manage_documents_of(split_part(name, '/', 1)) and public.requirement_file_visible(name))
  or ((name like 'club/privacy-%' or name ~ '^club/doc-[0-9]{10,16}\.pdf$') and public.is_board())
)
  and not exists (select 1 from public.club_documents d join public.club_requests r on r.document_id = d.id where d.file_path = name)
  and not exists (select 1 from public.club_request_responses r where r.file_path = name)
  and not exists (select 1 from public.requirement_versions v where v.reading_path = name)
  and not exists (
    select 1 from public.requirement_answers a
    where jsonb_path_exists(a.answers, '$.* ? (@ == $p)', jsonb_build_object('p', name))
  ));

-- A library file that a requirement reads cannot be removed from the library.
create function public.club_document_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.requirement_versions v where v.reading_path = old.file_path) then
    raise exception 'document_in_use' using errcode = 'P0001';
  end if;
  return old;
end
$$;
revoke all on function public.club_document_in_use() from public, anon, authenticated;
create trigger club_documents_in_use before delete on public.club_documents
  for each row execute function public.club_document_in_use();

-- A deleted member's answers go with the rest of their data (the files are removed by the delete-member function).
create or replace function public.delete_member_data(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not public.is_board() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = v_me then
    raise exception 'cannot_delete_self' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id = p_user and deleted_at is not null) then
    raise exception 'already_deleted' using errcode = 'P0001';
  end if;
  -- The last board member stays.
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'board')
     and not exists (select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
                     where ur.role = 'board' and ur.user_id <> p_user and pr.deleted_at is null) then
    raise exception 'last_board' using errcode = 'P0001';
  end if;

  update public.profiles
     set first_name = 'Utente', last_name = 'Eliminato', jersey_number = null, position = null,
         avatar_path = null, deleted_at = now()
   where id = p_user;

  delete from public.profile_contacts where user_id = p_user;
  delete from public.member_documents where user_id = p_user;
  delete from public.requirement_answers where user_id = p_user;
  delete from public.requirement_reminder_log where user_id = p_user;
  delete from public.club_request_responses where user_id = p_user;
  delete from public.absence_periods where user_id = p_user;
  delete from public.calendar_tokens where user_id = p_user;
  delete from public.reminder_prefs where user_id = p_user;
  delete from public.reminder_log where user_id = p_user;
  delete from public.certificate_log where user_id = p_user;
  delete from public.announcement_seen where user_id = p_user;
  delete from public.announcement_log where user_id = p_user;
  delete from public.event_new_log where user_id = p_user;
  delete from public.event_change_log where user_id = p_user;
  delete from public.event_message_seen where user_id = p_user;
  delete from public.notification_prefs where user_id = p_user;
  delete from public.push_subscriptions where user_id = p_user;
  delete from public.group_members where user_id = p_user;
  delete from public.user_roles where user_id = p_user;
  update public.invites set revoked_at = now() where created_by = p_user and used_at is null and revoked_at is null;

  insert into public.member_deletions (deleted_by) values (v_me);
end
$$;

commit;
