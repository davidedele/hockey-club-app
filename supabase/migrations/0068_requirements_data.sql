-- Required documents: copies what the club already has into the new model of migration 0067.
--
-- 1. The medical certificate becomes the requirement "Certificato medico": a file and a date of issue, ending
--    after the months of club_settings.certificate_months, confirmed by staff as club_settings.certificate_review
--    says (on: unless the date was read from the file; off: never).
-- 2. The privacy consent becomes the requirement "Informativa privacy": the privacy notice to read and one box.
--    Every earlier notice that somebody accepted becomes its own version, so those answers show as outdated.
-- 3. Every club request of migration 0064 becomes a requirement with the same id, with its responses.
-- 4. The certificate reminder log is copied, so nobody gets an email again for a date already warned about.
--
-- The old tables are left as they are and are removed in a later step. At the end the migration counts what it
-- copied and stops, changing nothing, if a number does not match.

do $copy$
declare
  v_months integer;
  v_review boolean;
  v_notice text;
  v_cert uuid;
  v_consent uuid;
  v_path text;
  v_n integer := 0;
  v_current integer;
  v_old_cert integer;
  v_old_consent integer;
  v_old_requests integer;
  v_old_responses integer;
  v_old_log integer;
  v_consent_blocks constant jsonb :=
    '[{"id":"accept","type":"checkbox","label":"Ho letto l''informativa e accetto","required":true}]';
begin
  select cs.certificate_months, cs.certificate_review, cs.privacy_notice_path
    into v_months, v_review, v_notice
    from public.club_settings cs limit 1;
  v_months := coalesce(v_months, 12);
  v_review := coalesce(v_review, true);

  -- The medical certificate ----------------------------------------------
  insert into public.requirements
    (slug, title, reason, expiry_block, expiry_months, review, visibility, blocking, staff_can_submit)
  values
    ('medical_certificate', 'Certificato medico',
     'Il club deve avere un certificato medico valido per farti giocare.',
     'issued', v_months, case when v_review then 'unless_read' else 'none' end, 'staff', true, true)
  returning id into v_cert;
  insert into public.requirement_versions (requirement_id, version, description, reading_path, blocks)
  values (v_cert, 1, '', null,
    '[{"id":"file","type":"file","label":"Certificato medico (foto o PDF)","required":true},
      {"id":"issued","type":"date","label":"Data di rilascio","required":true,"read_from_file":true}]');

  insert into public.requirement_answers
    (requirement_id, user_id, version, answers, sources, status, submitted_at, valid_until, reviewed_at, reviewed_by, review_note)
  select v_cert, d.user_id, 1,
    case when d.issued_on is null then jsonb_build_object('file', d.file_path)
         else jsonb_build_object('file', d.file_path, 'issued', d.issued_on::text) end,
    case when d.issued_on is null then '{}'::jsonb
         else jsonb_build_object('issued', coalesce(d.issued_source, 'typed')) end,
    case
      when d.issued_on is null and d.valid_until is null then 'rejected'
      when d.verified_at is not null then 'approved'
      when d.issued_on is null then 'pending'
      when d.issued_source = 'read' then 'complete'
      when v_review then 'pending'
      else 'complete'
    end,
    d.updated_at,
    case when d.issued_on is null then d.valid_until
         else coalesce(d.valid_until, (d.issued_on + make_interval(months => v_months))::date) end,
    d.verified_at, d.verified_by,
    case when d.issued_on is null and d.valid_until is null then 'Manca la data di rilascio.' else '' end
  from public.member_documents d
  where d.kind = 'medical_certificate' and d.file_path is not null;

  insert into public.requirement_reminder_log (requirement_id, user_id, valid_until, stage, sent_at)
  select v_cert, l.user_id, l.valid_until, l.stage, l.sent_at from public.certificate_log l;

  -- The privacy consent --------------------------------------------------
  insert into public.requirements
    (slug, title, reason, review, visibility, blocking, staff_can_submit, active)
  values
    ('privacy_consent', 'Informativa privacy',
     'Il club deve dirti quali dati conserva e avere la tua accettazione.',
     'none', 'staff', true, false, v_notice is not null)
  returning id into v_consent;

  create temp table _consent_versions (path text primary key, version integer not null) on commit drop;
  -- Version 0 holds the answers that name no notice at all.
  if exists (select 1 from public.member_documents where kind = 'privacy_consent' and file_path is null) then
    insert into public.requirement_versions (requirement_id, version, description, reading_path, blocks)
    values (v_consent, 0, 'Leggi l''informativa prima di accettare.', null, v_consent_blocks);
  end if;
  -- Every earlier notice that was accepted, in the order it was first accepted.
  for v_path in
    select d.file_path from public.member_documents d
     where d.kind = 'privacy_consent' and d.file_path is not null and d.file_path is distinct from v_notice
     group by d.file_path order by min(d.accepted_at)
  loop
    v_n := v_n + 1;
    insert into public.requirement_versions (requirement_id, version, description, reading_path, blocks)
    values (v_consent, v_n, 'Leggi l''informativa prima di accettare.', v_path, v_consent_blocks);
    insert into _consent_versions values (v_path, v_n);
  end loop;
  -- The notice in force is the current version.
  v_current := v_n + 1;
  insert into public.requirement_versions (requirement_id, version, description, reading_path, blocks)
  values (v_consent, v_current, 'Leggi l''informativa prima di accettare.', v_notice, v_consent_blocks);
  update public.requirements set current_version = v_current where id = v_consent;

  insert into public.requirement_answers
    (requirement_id, user_id, version, answers, status, submitted_at)
  select v_consent, d.user_id,
    case when d.file_path is null then 0
         when d.file_path = v_notice then v_current
         else (select cv.version from _consent_versions cv where cv.path = d.file_path) end,
    '{"accept": true}', 'complete', d.accepted_at
  from public.member_documents d
  where d.kind = 'privacy_consent' and d.accepted_at is not null;

  -- The club requests of migration 0064 -----------------------------------
  insert into public.requirements
    (id, title, reason, group_ids, deadline, review, visibility, blocking, staff_can_submit, active, created_by, created_at)
  select q.id, q.title, 'Richiesta del club.', q.group_ids, q.deadline,
    case when q.review then 'always' else 'none' end, 'staff', true, false, q.active, q.created_by, q.created_at
  from public.club_requests q;

  insert into public.requirement_versions (requirement_id, version, description, reading_path, blocks)
  select q.id, 1, q.instructions,
    (select d.file_path from public.club_documents d where d.id = q.document_id),
    case q.action
      when 'read' then '[{"id":"ok","type":"checkbox","label":"Ho letto il documento","required":true}]'::jsonb
      when 'accept' then '[{"id":"ok","type":"checkbox","label":"Accetto","required":true}]'::jsonb
      else '[{"id":"file","type":"file","label":"File","required":true}]'::jsonb
    end
  from public.club_requests q;

  insert into public.requirement_answers
    (requirement_id, user_id, version, answers, status, submitted_at, reviewed_at, reviewed_by, review_note)
  select s.request_id, s.user_id, 1,
    case when q.action = 'upload' then jsonb_build_object('file', s.file_path) else '{"ok": true}'::jsonb end,
    s.status, s.submitted_at, s.reviewed_at, s.reviewed_by, s.review_note
  from public.club_request_responses s
  join public.club_requests q on q.id = s.request_id;

  -- Check the copy ---------------------------------------------------------
  select count(*) into v_old_cert from public.member_documents where kind = 'medical_certificate' and file_path is not null;
  select count(*) into v_old_consent from public.member_documents where kind = 'privacy_consent' and accepted_at is not null;
  select count(*) into v_old_requests from public.club_requests;
  select count(*) into v_old_responses from public.club_request_responses;
  select count(*) into v_old_log from public.certificate_log;
  if (select count(*) from public.requirement_answers where requirement_id = v_cert) <> v_old_cert
     or (select count(*) from public.requirement_answers where requirement_id = v_consent) <> v_old_consent
     or (select count(*) from public.requirements where slug is null) <> v_old_requests
     or (select count(*) from public.requirement_answers where requirement_id not in (v_cert, v_consent)) <> v_old_responses
     or (select count(*) from public.requirement_reminder_log) <> v_old_log then
    raise exception 'requirements_copy_mismatch';
  end if;
end
$copy$;
