begin;

-- Migration 0068 copies the certificate, the consent and the club requests into the requirements.
-- The migration ran once on an empty database when this test started. Here the two seeded requirements are
-- removed, old style data is put in, and the migration runs again.
delete from public.requirement_answers;
delete from public.requirement_reminder_log;
delete from public.requirement_versions;
delete from public.requirements;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.test', now()),
  ('00000000-0000-0000-0000-000000000005', 'p5@example.test', now()),
  ('00000000-0000-0000-0000-000000000006', 'p6@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000003', 'Pau', 'Three'),
  ('00000000-0000-0000-0000-000000000004', 'Pam', 'Four'),
  ('00000000-0000-0000-0000-000000000005', 'Pat', 'Five'),
  ('00000000-0000-0000-0000-000000000006', 'Peg', 'Six');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board');
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;

update public.club_settings
   set certificate_months = 18, certificate_review = true, privacy_notice_path = 'club/privacy-1700000000500.pdf';

-- Old rows as the app wrote them over time. The stamp trigger is off so that rows of the old days (an end date
-- and no date of issue) can be made.
alter table public.member_documents disable trigger member_documents_stamp;
insert into public.member_documents (user_id, kind, file_path, issued_on, issued_source, valid_until, verified_at, verified_by) values
  (pg_temp.u('1'), 'medical_certificate', pg_temp.u('1')::text || '/medical_certificate-1700000000001.pdf', current_date - 40, 'read', (current_date - 40) + 540, null, null),
  (pg_temp.u('2'), 'medical_certificate', pg_temp.u('2')::text || '/medical_certificate-1700000000002.pdf', current_date - 30, 'typed', (current_date - 30) + 540, null, null),
  (pg_temp.u('3'), 'medical_certificate', pg_temp.u('3')::text || '/medical_certificate-1700000000003.pdf', current_date - 20, 'typed', (current_date - 20) + 540, now(), pg_temp.u('b1')),
  (pg_temp.u('4'), 'medical_certificate', pg_temp.u('4')::text || '/medical_certificate-1700000000004.pdf', null, null, current_date + 100, null, null),
  (pg_temp.u('5'), 'medical_certificate', pg_temp.u('5')::text || '/medical_certificate-1700000000005.pdf', null, null, null, null, null),
  (pg_temp.u('6'), 'medical_certificate', null, null, null, null, null, null);
insert into public.member_documents (user_id, kind, file_path, accepted_at) values
  (pg_temp.u('1'), 'privacy_consent', 'club/privacy-1700000000500.pdf', now() - interval '1 day'),
  (pg_temp.u('2'), 'privacy_consent', 'club/privacy-1700000000100.pdf', now() - interval '300 days'),
  (pg_temp.u('3'), 'privacy_consent', 'club/privacy-1700000000200.pdf', now() - interval '200 days'),
  (pg_temp.u('4'), 'privacy_consent', null, now() - interval '400 days');
alter table public.member_documents enable trigger member_documents_stamp;

insert into public.certificate_log (user_id, valid_until, stage) values
  (pg_temp.u('1'), current_date + 5, 30), (pg_temp.u('1'), current_date + 5, 7);

insert into public.club_documents (id, title, file_path) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Regolamento', 'club/doc-1700000000010.pdf');
insert into public.club_requests (id, title, instructions, action, document_id, review, active) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Leggi il regolamento', 'Leggilo con calma.', 'read', 'aaaaaaaa-0000-0000-0000-000000000001', false, true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Accetta il codice', '', 'accept', 'aaaaaaaa-0000-0000-0000-000000000001', false, false),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'Modulo di tesseramento', 'Firma e carica il modulo.', 'upload', null, true, true);
insert into public.club_request_responses (request_id, user_id, file_path, status, reviewed_at, reviewed_by, review_note) values
  ('bbbbbbbb-0000-0000-0000-000000000001', pg_temp.u('1'), null, 'complete', null, null, ''),
  ('bbbbbbbb-0000-0000-0000-000000000003', pg_temp.u('2'), pg_temp.u('2')::text || '/request-bbbbbbbb-0000-0000-0000-000000000003-abc123.pdf', 'pending', null, null, ''),
  ('bbbbbbbb-0000-0000-0000-000000000003', pg_temp.u('3'), pg_temp.u('3')::text || '/request-bbbbbbbb-0000-0000-0000-000000000003-def456.pdf', 'approved', now(), pg_temp.u('b1'), 'Tutto in ordine');

\echo == the migration runs on the old data
\ir ../migrations/0068_requirements_data.sql

\echo == the certificate
select test.rows('one certificate requirement', $$select 1 from public.requirements where slug = 'medical_certificate' and expiry_months = 18 and expiry_block = 'issued' and review = 'unless_read' and staff_can_submit and visibility = 'staff' and current_version = 1$$, 1);
select test.rows('one answer for each file (the sixth has no file)', $$select 1 from public.requirement_answers a join public.requirements r on r.id = a.requirement_id where r.slug = 'medical_certificate'$$, 5);
select test.rows('a date read from the file counts', $$select 1 from public.requirement_answers a join public.requirements r on r.id = a.requirement_id where r.slug = 'medical_certificate' and a.user_id = pg_temp.u('1') and a.status = 'complete' and a.sources = '{"issued":"read"}' and a.answers ->> 'issued' = (current_date - 40)::text$$, 1);
select test.rows('its end date is the old one', $$select 1 from public.requirement_answers a join public.member_documents d on d.user_id = a.user_id and d.kind = 'medical_certificate' where a.user_id = pg_temp.u('1') and a.valid_until = d.valid_until$$, 1);
select test.rows('a typed date waits for staff', $$select 1 from public.requirement_answers a where a.user_id = pg_temp.u('2') and a.status = 'pending' and a.sources = '{"issued":"typed"}'$$, 1);
select test.rows('a confirmed date stays confirmed', $$select 1 from public.requirement_answers a join public.requirements r on r.id = a.requirement_id where r.slug = 'medical_certificate' and a.user_id = pg_temp.u('3') and a.status = 'approved' and a.reviewed_by = pg_temp.u('b1') and a.reviewed_at is not null$$, 1);
select test.rows('an old row with an end date and no date of issue waits for staff and keeps its end date', $$select 1 from public.requirement_answers a join public.requirements r on r.id = a.requirement_id where r.slug = 'medical_certificate' and a.user_id = pg_temp.u('4') and a.status = 'pending' and a.valid_until = current_date + 100 and not (a.answers ? 'issued')$$, 1);
select test.rows('a file with no date at all is asked again, with a note', $$select 1 from public.requirement_answers a where a.user_id = pg_temp.u('5') and a.status = 'rejected' and a.review_note = 'Manca la data di rilascio.'$$, 1);
select test.rows('a row without a file is not copied', $$select 1 from public.requirement_answers a join public.requirements r on r.id = a.requirement_id where r.slug = 'medical_certificate' and a.user_id = pg_temp.u('6')$$, 0);
select test.rows('the reminders already sent are kept', $$select 1 from public.requirement_reminder_log l join public.requirements r on r.id = l.requirement_id where r.slug = 'medical_certificate'$$, 2);

\echo == the consent
select test.rows('one consent requirement, active, on its current notice', $$select 1 from public.requirements r join public.requirement_versions v on v.requirement_id = r.id and v.version = r.current_version where r.slug = 'privacy_consent' and r.active and v.reading_path = 'club/privacy-1700000000500.pdf' and r.current_version = 3$$, 1);
select test.rows('a version for each earlier notice and one for no notice', $$select 1 from public.requirement_versions v join public.requirements r on r.id = v.requirement_id where r.slug = 'privacy_consent'$$, 4);
select test.rows('the earliest notice accepted is version 1', $$select 1 from public.requirement_versions v join public.requirements r on r.id = v.requirement_id where r.slug = 'privacy_consent' and v.version = 1 and v.reading_path = 'club/privacy-1700000000100.pdf'$$, 1);
select test.rows('answers follow the notice they accepted', $$select 1 from public.requirement_answers a join public.requirements r on r.id = a.requirement_id where r.slug = 'privacy_consent' and ((a.user_id = pg_temp.u('1') and a.version = 3) or (a.user_id = pg_temp.u('2') and a.version = 1) or (a.user_id = pg_temp.u('3') and a.version = 2) or (a.user_id = pg_temp.u('4') and a.version = 0)) and a.status = 'complete' and a.answers = '{"accept": true}'$$, 4);
select test.rows('only the current notice counts as given: the others are outdated', $$select 1 from public.requirement_answers a join public.requirements r on r.id = a.requirement_id where r.slug = 'privacy_consent' and a.version < r.current_version$$, 3);
select test.rows('the date of acceptance is kept', $$select 1 from public.requirement_answers a join public.requirements r on r.id = a.requirement_id where r.slug = 'privacy_consent' and a.user_id = pg_temp.u('2') and a.submitted_at < now() - interval '299 days'$$, 1);

\echo == the club requests
select test.rows('every request is a requirement with its own id', $$select 1 from public.requirements r join public.club_requests q on q.id = r.id where r.slug is null$$, 3);
select test.rows('the reading file and the text come along', $$select 1 from public.requirement_versions v where v.requirement_id = 'bbbbbbbb-0000-0000-0000-000000000001' and v.reading_path = 'club/doc-1700000000010.pdf' and v.description = 'Leggilo con calma.' and v.blocks -> 0 ->> 'type' = 'checkbox'$$, 1);
select test.rows('an upload request asks for a file, reviewed by staff', $$select 1 from public.requirements r join public.requirement_versions v on v.requirement_id = r.id where r.id = 'bbbbbbbb-0000-0000-0000-000000000003' and r.review = 'always' and v.blocks -> 0 ->> 'type' = 'file'$$, 1);
select test.rows('an archived request stays archived', $$select 1 from public.requirements where id = 'bbbbbbbb-0000-0000-0000-000000000002' and not active$$, 1);
select test.rows('three responses', $$select 1 from public.requirement_answers a where a.requirement_id in (select id from public.requirements where slug is null)$$, 3);
select test.rows('a file response keeps its file', $$select 1 from public.requirement_answers a where a.requirement_id = 'bbbbbbbb-0000-0000-0000-000000000003' and a.user_id = pg_temp.u('2') and a.status = 'pending' and a.answers ->> 'file' like '%/request-bbbbbbbb-0000-0000-0000-000000000003-abc123.pdf'$$, 1);
select test.rows('a review keeps who and what was said', $$select 1 from public.requirement_answers a where a.requirement_id = 'bbbbbbbb-0000-0000-0000-000000000003' and a.user_id = pg_temp.u('3') and a.status = 'approved' and a.reviewed_by = pg_temp.u('b1') and a.review_note = 'Tutto in ordine'$$, 1);

\echo == what the players see after the copy
select test.login(pg_temp.u('2'));
select test.rows('a player reads their own answers', $$select 1 from public.requirement_answers$$, 3);
select test.rows('and the five requirements', $$select 1 from public.requirements$$, 5);
select test.logout();

rollback;
\echo ALL REQUIREMENTS DATA TESTS PASSED
