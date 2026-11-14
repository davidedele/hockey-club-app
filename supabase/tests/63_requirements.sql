begin;

-- Required documents (migration 0067): one model for everything staff ask from players.
-- Migration 0068 seeded the certificate and the consent requirements; these tests start from none.
delete from public.requirement_answers;
delete from public.requirement_reminder_log;
delete from public.requirement_versions;
delete from public.requirements;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000003', 'Pau', 'Three');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.profile_contacts (user_id, email) select id, id::text || '@example.test' from public.profiles;
insert into public.group_members (group_id, user_id) values
  ((select id from public.groups where code = 'A'), '00000000-0000-0000-0000-000000000001'),
  ((select id from public.groups where code = 'A'), '00000000-0000-0000-0000-000000000002'),
  ((select id from public.groups where code = 'B'), '00000000-0000-0000-0000-000000000003');

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
-- The ids of the requirements made below, kept in session settings so they survive a change of role.
create function pg_temp.cert() returns uuid language sql as $$ select current_setting('t.cert')::uuid $$;
create function pg_temp.consent() returns uuid language sql as $$ select current_setting('t.consent')::uuid $$;
create function pg_temp.photo() returns uuid language sql as $$ select current_setting('t.photo')::uuid $$;
-- A file of a member for a requirement: <member>/req-<requirement>-<36 characters>.pdf
create function pg_temp.rf(p_user text, p_req uuid, p_n text) returns text language sql as $$
  select pg_temp.u(p_user)::text || '/req-' || p_req::text || '-00000000-0000-0000-0000-0000000000' || lpad(p_n, 2, '0') || '.pdf'
$$;

\echo == only the board writes requirements
select test.login(pg_temp.u('1'));
select test.fails('a player cannot make a requirement', $$select public.save_requirement(null, '{"title":"X","reason":"Y"}', '{"blocks":[{"id":"a","type":"checkbox","label":"Ok","required":true}]}', 'new')$$, 'forbidden');
select test.fails('a player cannot write the table', $$insert into public.requirements (title, reason) values ('X', 'Y')$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.fails('a coach cannot make a requirement', $$select public.save_requirement(null, '{"title":"X","reason":"Y"}', '{"blocks":[{"id":"a","type":"checkbox","label":"Ok","required":true}]}', 'new')$$, 'forbidden');
select test.logout();

select test.login(pg_temp.u('b1'));
select set_config('t.cert', public.save_requirement(null,
  '{"title":"Certificato medico","reason":"Per giocare","expiry_block":"issued","expiry_months":12,"review":"unless_read","staff_can_submit":true}',
  '{"description":"","reading_path":null,"blocks":[{"id":"file","type":"file","label":"Certificato","required":true},{"id":"issued","type":"date","label":"Data di rilascio","required":true,"read_from_file":true}]}',
  'new')::text, false);
select set_config('t.consent', public.save_requirement(null,
  '{"title":"Informativa privacy","reason":"Obbligo di legge"}',
  '{"description":"Leggi il documento.","reading_path":"club/privacy-1700000000000.pdf","blocks":[{"id":"accept","type":"checkbox","label":"Ho letto e accetto","required":true}]}',
  'new')::text, false);
select set_config('t.photo', public.save_requirement(null,
  jsonb_build_object('title', 'Consenso foto', 'reason', 'Per le foto', 'visibility', 'board', 'group_ids', jsonb_build_array((select id from public.groups where code = 'B'))),
  '{"blocks":[{"id":"site","type":"checkbox","label":"Sito","required":true},{"id":"social","type":"checkbox","label":"Social","required":false}]}',
  'new')::text, false);
select test.logout();

\echo == a requirement must be well formed
select test.login(pg_temp.u('b1'));
select test.fails('two blocks with the same id', $$select public.save_requirement(null, '{"title":"X","reason":"Y"}', '{"blocks":[{"id":"a","type":"checkbox","label":"1","required":true},{"id":"a","type":"checkbox","label":"2","required":true}]}', 'new')$$, 'requirement_blocks_invalid');
select test.fails('an unknown block type (free text is not allowed)', $$select public.save_requirement(null, '{"title":"X","reason":"Y"}', '{"blocks":[{"id":"a","type":"textarea","label":"1","required":true}]}', 'new')$$, 'requirement_blocks_invalid');
select test.fails('a requirement of only a paragraph', $$select public.save_requirement(null, '{"title":"X","reason":"Y"}', '{"blocks":[{"id":"a","type":"text","label":"Solo testo"}]}', 'new')$$, 'requirement_blocks_invalid');
select test.fails('no blocks', $$select public.save_requirement(null, '{"title":"X","reason":"Y"}', '{"blocks":[]}', 'new')$$, 'requirement_blocks_invalid');
select test.fails('an unknown key in a block', $$select public.save_requirement(null, '{"title":"X","reason":"Y"}', '{"blocks":[{"id":"a","type":"checkbox","label":"1","required":true,"hint":"x"}]}', 'new')$$, 'requirement_blocks_invalid');
select test.fails('an end date that counts from a checkbox', $$select public.save_requirement(null, '{"title":"X","reason":"Y","expiry_block":"a","expiry_months":6}', '{"blocks":[{"id":"a","type":"checkbox","label":"1","required":true}]}', 'new')$$, 'requirement_expiry_invalid');
select test.fails('months without a block', $$select public.save_requirement(null, '{"title":"X","reason":"Y","expiry_months":6}', '{"blocks":[{"id":"a","type":"date","label":"1","required":true}]}', 'new')$$, 'requirements_check');
select test.fails('"unless read" with no date to read', $$select public.save_requirement(null, '{"title":"X","reason":"Y","review":"unless_read"}', '{"blocks":[{"id":"a","type":"checkbox","label":"1","required":true}]}', 'new')$$, 'requirement_review_invalid');
select test.fails('a reading file outside the club folder', $$select public.save_requirement(null, '{"title":"X","reason":"Y"}', '{"reading_path":"p1/secret.pdf","blocks":[{"id":"a","type":"checkbox","label":"1","required":true}]}', 'new')$$, 'reading_path');
select test.fails('a group that does not exist', $$select public.save_requirement(null, '{"title":"X","reason":"Y","group_ids":[9999]}', '{"blocks":[{"id":"a","type":"checkbox","label":"1","required":true}]}', 'new')$$, 'requirement_groups_invalid');
select test.fails('a title is needed', $$select public.save_requirement(null, '{"reason":"Y"}', '{"blocks":[{"id":"a","type":"checkbox","label":"1","required":true}]}', 'new')$$, 'requirement_fields_missing');
select test.logout();

\echo == who sees which requirement
select test.login(pg_temp.u('1'));
select test.rows('player 1 sees the two requirements for everybody', $$select 1 from public.requirements$$, 2);
select test.rows('and not the one for group B', $$select 1 from public.requirements where id = pg_temp.photo()$$, 0);
select test.rows('its versions follow', $$select 1 from public.requirement_versions where requirement_id = pg_temp.photo()$$, 0);
select test.logout();
select test.login(pg_temp.u('3'));
select test.rows('player 3 in group B sees all three', $$select 1 from public.requirements$$, 3);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('a coach sees every requirement', $$select 1 from public.requirements$$, 3);
select test.logout();

\echo == nobody writes an answer directly
select test.login(pg_temp.u('1'));
select test.fails('no direct insert', $$insert into public.requirement_answers (requirement_id, user_id, version, status) values (pg_temp.consent(), pg_temp.u('1'), 1, 'complete')$$, 'permission denied');
select test.fails('no direct update', $$update public.requirement_answers set status = 'approved'$$, 'permission denied');
select test.fails('no direct delete', $$delete from public.requirement_answers$$, 'permission denied');
select test.logout();

\echo == the consent: a mandatory checkbox cannot be skipped
select test.login(pg_temp.u('1'));
select test.fails('an unticked mandatory checkbox', $$select public.submit_requirement(pg_temp.consent(), null, '{"accept":false}')$$, 'requirement_answer_required');
select test.fails('a missing mandatory checkbox', $$select public.submit_requirement(pg_temp.consent(), null, '{}')$$, 'requirement_answer_required');
select test.fails('a checkbox that is not a boolean', $$select public.submit_requirement(pg_temp.consent(), null, '{"accept":"yes"}')$$, 'requirement_answer_invalid');
select test.fails('an answer for a block that does not exist', $$select public.submit_requirement(pg_temp.consent(), null, '{"accept":true,"note":"x"}')$$, 'requirement_answer_unknown');
select test.works('player 1 accepts', $$select public.submit_requirement(pg_temp.consent(), null, '{"accept":true}')$$);
select test.rows('it counts at once, as there is no review', $$select 1 from public.requirement_answers where requirement_id = pg_temp.consent() and status = 'complete' and version = 1$$, 1);
select test.fails('a consent is not given twice', $$select public.submit_requirement(pg_temp.consent(), null, '{"accept":true}')$$, 'requirement_already_answered');
select test.logout();

\echo == the group of the requirement decides
select test.login(pg_temp.u('1'));
select test.fails('a player of group A cannot answer the requirement of group B', $$select public.submit_requirement(pg_temp.photo(), null, '{"site":true}')$$, 'forbidden');
select test.logout();
select test.login(pg_temp.u('3'));
select test.works('a player of group B can, with the optional box left out', $$select public.submit_requirement(pg_temp.photo(), null, '{"site":true}')$$);
select test.rows('and the optional box is stored as false', $$select 1 from public.requirement_answers where requirement_id = pg_temp.photo() and answers = '{"site":true,"social":false}'$$, 1);
select test.logout();

\echo == the certificate: a file, a date, an end date
insert into storage.objects (bucket_id, name) values
  ('documents', pg_temp.rf('1', pg_temp.cert(), '1')),
  ('documents', pg_temp.rf('2', pg_temp.cert(), '1')),
  ('documents', pg_temp.rf('3', pg_temp.photo(), '1'));
select test.login(pg_temp.u('1'));
select test.fails('a file of another member', format($$select public.submit_requirement(pg_temp.cert(), null, '{"file":"%s","issued":"%s"}')$$, pg_temp.rf('2', pg_temp.cert(), '1'), current_date - 10), 'requirement_file_invalid');
select test.fails('a file that was never uploaded', format($$select public.submit_requirement(pg_temp.cert(), null, '{"file":"%s","issued":"%s"}')$$, pg_temp.rf('1', pg_temp.cert(), '9'), current_date - 10), 'requirement_file_invalid');
select test.fails('a file made for another requirement', format($$select public.submit_requirement(pg_temp.cert(), null, '{"file":"%s","issued":"%s"}')$$, pg_temp.rf('1', pg_temp.consent(), '1'), current_date - 10), 'requirement_file_invalid');
select test.fails('a file is mandatory', format($$select public.submit_requirement(pg_temp.cert(), null, '{"issued":"%s"}')$$, current_date - 10), 'requirement_answer_required');
select test.fails('a date is mandatory', format($$select public.submit_requirement(pg_temp.cert(), null, '{"file":"%s"}')$$, pg_temp.rf('1', pg_temp.cert(), '1')), 'requirement_answer_required');
select test.fails('a date in the future', format($$select public.submit_requirement(pg_temp.cert(), null, '{"file":"%s","issued":"%s"}')$$, pg_temp.rf('1', pg_temp.cert(), '1'), current_date + 30), 'issued_on_future');
select test.fails('a date too old', format($$select public.submit_requirement(pg_temp.cert(), null, '{"file":"%s","issued":"%s"}')$$, pg_temp.rf('1', pg_temp.cert(), '1'), current_date - 1200), 'issued_on_too_old');
select test.fails('a date that is not a date', format($$select public.submit_requirement(pg_temp.cert(), null, '{"file":"%s","issued":"2026-13-45"}')$$, pg_temp.rf('1', pg_temp.cert(), '1')), 'requirement_answer_invalid');
select test.works('a date read from the file', format($$select public.submit_requirement(pg_temp.cert(), null, '{"file":"%s","issued":"%s"}', '{"issued":"read"}')$$, pg_temp.rf('1', pg_temp.cert(), '1'), current_date - 100));
select test.rows('counts at once', $$select 1 from public.requirement_answers where requirement_id = pg_temp.cert() and user_id = pg_temp.u('1') and status = 'complete'$$, 1);
select test.rows('and ends 12 months after the date', $$select 1 from public.requirement_answers where requirement_id = pg_temp.cert() and user_id = pg_temp.u('1') and valid_until = ((current_date - 100) + interval '12 months')::date$$, 1);
select test.logout();
select test.login(pg_temp.u('2'));
select test.works('a typed date', format($$select public.submit_requirement(pg_temp.cert(), null, '{"file":"%s","issued":"%s"}', '{"issued":"typed"}')$$, pg_temp.rf('2', pg_temp.cert(), '1'), current_date - 20));
select test.rows('waits for staff', $$select 1 from public.requirement_answers where requirement_id = pg_temp.cert() and user_id = pg_temp.u('2') and status = 'pending'$$, 1);
select test.works('a member can send it again (it expires, so it can be renewed)', format($$select public.submit_requirement(pg_temp.cert(), null, '{"file":"%s","issued":"%s"}', '{"issued":"typed"}')$$, pg_temp.rf('2', pg_temp.cert(), '1'), current_date - 21));
select test.rows('a player does not read the answers of another', $$select 1 from public.requirement_answers where user_id = pg_temp.u('1')$$, 0);
select test.fails('a player cannot review', $$select public.review_requirement_answer(pg_temp.cert(), pg_temp.u('2'), true)$$, 'forbidden');
select test.logout();

\echo == staff confirm
select test.login(pg_temp.u('c1'));
select test.rows('a coach reads the certificates', $$select 1 from public.requirement_answers where requirement_id = pg_temp.cert()$$, 2);
select test.fails('a date that is not in the requirement', $$select public.review_requirement_answer(pg_temp.cert(), pg_temp.u('2'), true, '', '{"nothere":"2026-01-01"}')$$, 'requirement_answer_unknown');
select test.works('the coach corrects the date and approves', format($$select public.review_requirement_answer(pg_temp.cert(), pg_temp.u('2'), true, 'Ok', '{"issued":"%s"}')$$, current_date - 50));
select test.rows('approved with the date of the coach', $$select 1 from public.requirement_answers where requirement_id = pg_temp.cert() and user_id = pg_temp.u('2') and status = 'approved' and reviewed_by = pg_temp.u('c1') and answers ->> 'issued' = (current_date - 50)::text$$, 1);
select test.rows('the end date follows the new date', $$select 1 from public.requirement_answers where requirement_id = pg_temp.cert() and user_id = pg_temp.u('2') and valid_until = ((current_date - 50) + interval '12 months')::date$$, 1);
select test.fails('a second review finds it changed', $$select public.review_requirement_answer(pg_temp.cert(), pg_temp.u('2'), false)$$, 'request_review_changed');
select test.fails('nothing to review', $$select public.review_requirement_answer(pg_temp.cert(), pg_temp.u('3'), true)$$, 'request_review_changed');
select test.works('a coach may reject a certificate that counted at once', $$select public.review_requirement_answer(pg_temp.cert(), pg_temp.u('1'), false, 'Illeggibile')$$);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('player 1 sees the note on their own answer', $$select 1 from public.requirement_answers where requirement_id = pg_temp.cert() and status = 'rejected' and review_note = 'Illeggibile'$$, 1);
select test.works('and can send it again', format($$select public.submit_requirement(pg_temp.cert(), null, '{"file":"%s","issued":"%s"}', '{"issued":"read"}')$$, pg_temp.rf('1', pg_temp.cert(), '1'), current_date - 90));
select test.logout();

\echo == staff answering for a member
select test.login(pg_temp.u('c1'));
select test.fails('a coach cannot accept a consent for a member', $$select public.submit_requirement(pg_temp.consent(), pg_temp.u('2'), '{"accept":true}')$$, 'forbidden');
select test.works('a coach can send the certificate of a member', format($$select public.submit_requirement(pg_temp.cert(), pg_temp.u('2'), '{"file":"%s","issued":"%s"}', '{"issued":"read"}')$$, pg_temp.rf('2', pg_temp.cert(), '1'), current_date - 30));
select test.fails('but not for a member the requirement does not apply to', format($$select public.submit_requirement(pg_temp.photo(), pg_temp.u('1'), '{"site":true}')$$), 'forbidden');
select test.logout();
select test.login(pg_temp.u('b1'));
select test.fails('the board cannot accept a consent for a member either', $$select public.submit_requirement(pg_temp.consent(), pg_temp.u('2'), '{"accept":true}')$$, 'forbidden');
select test.logout();

\echo == board only requirements stay with the board
select test.login(pg_temp.u('c1'));
select test.rows('a coach does not read the answers of a board only requirement', $$select 1 from public.requirement_answers where requirement_id = pg_temp.photo()$$, 0);
select test.rows('nor the file', $$select 1 from storage.objects where name = pg_temp.rf('3', pg_temp.photo(), '1')$$, 0);
select test.fails('a coach cannot review it', $$select public.review_requirement_answer(pg_temp.photo(), pg_temp.u('3'), true)$$, 'forbidden');
select test.logout();
select test.login(pg_temp.u('b1'));
select test.rows('the board reads the answers', $$select 1 from public.requirement_answers where requirement_id = pg_temp.photo()$$, 1);
select test.rows('and the file', $$select 1 from storage.objects where name = pg_temp.rf('3', pg_temp.photo(), '1')$$, 1);
select test.logout();
select test.login(pg_temp.u('3'));
select test.rows('the member keeps their own file', $$select 1 from storage.objects where name = pg_temp.rf('3', pg_temp.photo(), '1')$$, 1);
select test.logout();

\echo == corrections and new versions
select test.login(pg_temp.u('b1'));
select test.works('a correction of a label', $$select public.save_requirement(pg_temp.consent(), '{}', '{"blocks":[{"id":"accept","type":"checkbox","label":"Ho letto e accetto l informativa","required":true}]}', 'correction')$$);
select test.rows('is kept in the same version', $$select 1 from public.requirement_versions where requirement_id = pg_temp.consent() and version = 1 and blocks -> 0 ->> 'label' = 'Ho letto e accetto l informativa'$$, 1);
select test.fails('a correction cannot add a block', $$select public.save_requirement(pg_temp.consent(), '{}', '{"blocks":[{"id":"accept","type":"checkbox","label":"A","required":true},{"id":"more","type":"checkbox","label":"B","required":true}]}', 'correction')$$, 'requirement_correction_structure');
select test.fails('a correction cannot make a box optional', $$select public.save_requirement(pg_temp.consent(), '{}', '{"blocks":[{"id":"accept","type":"checkbox","label":"A","required":false}]}', 'correction')$$, 'requirement_correction_structure');
select test.fails('a correction cannot change the reading file', $$select public.save_requirement(pg_temp.consent(), '{}', '{"reading_path":"club/privacy-1700000000999.pdf","blocks":[{"id":"accept","type":"checkbox","label":"A","required":true}]}', 'correction')$$, 'requirement_correction_structure');
select test.fails('"new" needs no id and the others need one', $$select public.save_requirement(pg_temp.consent(), '{"title":"X","reason":"Y"}', '{"blocks":[{"id":"a","type":"checkbox","label":"A","required":true}]}', 'new')$$, 'requirement_mode_invalid');
select test.rows('nobody answered again so far', $$select 1 from public.requirement_answers where requirement_id = pg_temp.consent() and version = 1$$, 1);
select test.works('a new version', $$select public.save_requirement(pg_temp.consent(), '{}', '{"reading_path":"club/privacy-1700000000999.pdf","blocks":[{"id":"accept","type":"checkbox","label":"Ho letto e accetto","required":true}]}', 'version')$$);
select test.rows('the requirement points to it', $$select 1 from public.requirements where id = pg_temp.consent() and current_version = 2$$, 1);
select test.rows('both versions are kept', $$select 1 from public.requirement_versions where requirement_id = pg_temp.consent()$$, 2);
select test.rows('the old answer is kept with its version', $$select 1 from public.requirement_answers where requirement_id = pg_temp.consent() and version = 1$$, 1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.works('the member answers the new version', $$select public.submit_requirement(pg_temp.consent(), null, '{"accept":true}')$$);
select test.rows('and the answer moves to it', $$select 1 from public.requirement_answers where requirement_id = pg_temp.consent() and version = 2$$, 1);
select test.logout();

\echo == withdrawing
select test.login(pg_temp.u('1'));
select test.works('a member withdraws their consent', $$select public.withdraw_requirement_answer(pg_temp.consent())$$);
select test.fails('nothing left to withdraw', $$select public.withdraw_requirement_answer(pg_temp.consent())$$, 'requirement_answer_missing');
select test.logout();

\echo == files of an answer are kept
select test.login(pg_temp.u('1'));
select test.affected('a member cannot remove a file the certificate still uses', format($$delete from storage.objects where name = '%s'$$, pg_temp.rf('1', pg_temp.cert(), '1')), 0);
select test.logout();

\echo == a library file that a requirement reads stays
insert into public.club_documents (title, file_path) values ('Informativa foto', 'club/doc-1700000000001.pdf');
select test.login(pg_temp.u('b1'));
select public.save_requirement(null, '{"title":"Regolamento","reason":"Regole del club"}', '{"reading_path":"club/doc-1700000000001.pdf","blocks":[{"id":"ok","type":"checkbox","label":"Accetto","required":true}]}', 'new');
select test.fails('the board cannot remove it from the library', $$delete from public.club_documents where file_path = 'club/doc-1700000000001.pdf'$$, 'document_in_use');
select test.logout();

\echo == deleting a member removes their answers
select test.login(pg_temp.u('b1'));
select test.works('the board deletes player 2', $$select public.delete_member_data(pg_temp.u('2'))$$);
select test.logout();
select test.rows('their answers are gone', $$select 1 from public.requirement_answers where user_id = pg_temp.u('2')$$, 0);
select test.rows('the others stay', $$select 1 from public.requirement_answers$$, 2);

rollback;
\echo ALL REQUIREMENTS TESTS PASSED
