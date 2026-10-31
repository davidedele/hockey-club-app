begin;

-- People: board1 (board), coach1 (coach), p1 and p2 (players), u9 (account without a profile).
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;

insert into auth.users (id, email, email_confirmed_at) values (pg_temp.u('3'), 'p3@example.test', now());
insert into public.profiles (id, first_name, last_name) values (pg_temp.u('3'), 'Pat', 'Three');
create function pg_temp.f(p text, f text) returns text language sql as $$ select pg_temp.u(p)::text || '/' || f $$;
-- Reminders need a group and an email.
insert into public.profile_contacts (user_id, email) select id, id::text || '@example.test' from public.profiles;
insert into public.group_members (group_id, user_id)
  select (select id from public.groups where code = 'A'), pg_temp.u(x) from unnest(array['1', '2', '3']) x;

\echo == a date needs a file
select test.login(pg_temp.u('1'));
select test.fails('a date of issue without a file is refused', $$insert into public.member_documents (user_id, kind, issued_on, issued_source) values (pg_temp.u('1'), 'medical_certificate', current_date - 5, 'typed')$$, 'check constraint');
select test.works('a file without a date is allowed (nothing to read yet)', $$insert into public.member_documents (user_id, kind, file_path) values (pg_temp.u('1'), 'medical_certificate', pg_temp.f('1', 'medical_certificate-2000000000.pdf'))$$);
select test.rows('a file alone has no end date', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and valid_until is null and issued_on is null$$, 1);
select test.works('the date read from the file is saved', $$update public.member_documents set issued_on = current_date - 30, issued_source = 'read' where user_id = pg_temp.u('1')$$);
select test.rows('the end date is one year after the date of issue', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and valid_until = (issued_on + interval '1 year')::date$$, 1);
select test.rows('a date nobody checked has no verification', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and verified_at is null and verified_by is null$$, 1);
select test.fails('the end date cannot be typed', $$update public.member_documents set valid_until = current_date + 900 where user_id = pg_temp.u('1')$$, 'permission denied');
select test.fails('the end date cannot be typed when inserting', $$insert into public.member_documents (user_id, kind, valid_until, file_path) values (pg_temp.u('2'), 'medical_certificate', current_date + 900, pg_temp.f('2', 'medical_certificate-2000000000.pdf'))$$, 'permission denied');
select test.fails('verification cannot be written by the player', $$update public.member_documents set verified_at = now() where user_id = pg_temp.u('1')$$, 'permission denied');
select test.fails('the verifier cannot be written by the player', $$update public.member_documents set verified_by = pg_temp.u('1') where user_id = pg_temp.u('1')$$, 'permission denied');
select test.fails('a date of issue in the future is refused', $$update public.member_documents set issued_on = current_date + 30 where user_id = pg_temp.u('1')$$, 'issued_on_future');
select test.fails('a date of issue from years ago is refused', $$update public.member_documents set issued_on = current_date - 2000 where user_id = pg_temp.u('1')$$, 'issued_on_too_old');
select test.fails('a date needs a source', $$update public.member_documents set issued_source = null where user_id = pg_temp.u('1')$$, 'check constraint');
select test.fails('the player cannot call the verification', $$select public.verify_certificate(pg_temp.u('1'), current_date - 30)$$, 'staff only');
select test.works('removing the file and the date together is allowed', $$update public.member_documents set file_path = null, issued_on = null, issued_source = null where user_id = pg_temp.u('1')$$);
select test.rows('with no date of issue there is no end date', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and valid_until is null$$, 1);

select test.works('the player uploads again and types the date', $$update public.member_documents set file_path = pg_temp.f('1', 'medical_certificate-2000000009.pdf'), issued_on = current_date - 3, issued_source = 'typed' where user_id = pg_temp.u('1')$$);
select test.fails('the file can go but the date stays: refused', $$update public.member_documents set file_path = null where user_id = pg_temp.u('1')$$, 'check constraint');
select test.logout();

\echo == staff confirm
select test.login(pg_temp.u('c1'));
select test.fails('staff cannot confirm a member who has no certificate', $$select public.verify_certificate(pg_temp.u('2'), current_date - 3)$$, 'certificate_file_missing');
select test.works('staff confirm the date after opening the file', $$select public.verify_certificate(pg_temp.u('1'), current_date - 3)$$);
select test.rows('the confirmation records who and when', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and verified_by = pg_temp.u('c1') and verified_at is not null$$, 1);
select test.works('staff correct the date', $$select public.verify_certificate(pg_temp.u('1'), current_date - 20)$$);
select test.rows('the end date follows the corrected date', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and issued_on = current_date - 20 and valid_until = (current_date - 20 + interval '1 year')::date and verified_at is not null$$, 1);
select test.fails('staff cannot confirm without a date', $$select public.verify_certificate(pg_temp.u('1'), null)$$, 'issued_on_missing');
select test.fails('staff cannot set a date for a member with no file', $$insert into public.member_documents (user_id, kind, issued_on, issued_source) values (pg_temp.u('2'), 'medical_certificate', current_date - 3, 'typed')$$, 'check constraint');
select test.works('staff add a file for a member', $$insert into public.member_documents (user_id, kind, file_path) values (pg_temp.u('2'), 'medical_certificate', pg_temp.f('2', 'medical_certificate-2000000000.jpg'))$$);
select test.fails('staff cannot write the verification directly', $$update public.member_documents set verified_at = now() where user_id = pg_temp.u('2')$$, 'permission denied');
select test.fails('staff cannot type an end date', $$update public.member_documents set valid_until = current_date + 5 where user_id = pg_temp.u('2')$$, 'permission denied');
select test.logout();

select test.login(pg_temp.u('1'));
select test.works('the player changes the date again', $$update public.member_documents set issued_on = current_date - 10 where user_id = pg_temp.u('1')$$);
select test.rows('a changed date has to be confirmed again', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and verified_at is null and verified_by is null$$, 1);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.works('staff confirm again', $$select public.verify_certificate(pg_temp.u('1'), current_date - 10)$$);
select test.logout();
select test.login(pg_temp.u('1'));
select test.works('the player replaces the file', $$update public.member_documents set file_path = pg_temp.f('1', 'medical_certificate-2000000010.pdf') where user_id = pg_temp.u('1')$$);
select test.rows('a new file has to be confirmed again', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and verified_at is null$$, 1);
select test.logout();

\echo == other people
select test.login(pg_temp.u('2'));
select test.fails('another player cannot call the verification', $$select public.verify_certificate(pg_temp.u('1'), current_date)$$, 'staff only');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot call the verification', $$select public.verify_certificate(pg_temp.u('1'), current_date)$$, 'permission denied');
select test.logout();

\echo == reminders only for a checked date
create temp table base as select (date_trunc('day', now() at time zone 'Europe/Rome') + interval '12 hours') at time zone 'Europe/Rome' as t;
grant select on base to service_role;
grant usage on schema test to service_role;
select test.login(pg_temp.u('c1'));
select public.verify_certificate(pg_temp.u('1'), current_date - 345); -- ends in 20 days: the one month warning
select test.logout();
set local role service_role;
select test.rows('a confirmed date is due', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('1') and stage = 30$$, 1);
reset role;
-- p3: a file and a typed date nobody has looked at; p2: only a file.
insert into public.member_documents (user_id, kind, file_path) values (pg_temp.u('3'), 'medical_certificate', pg_temp.f('3', 'medical_certificate-2000000000.pdf'));
update public.member_documents set issued_on = current_date - 345, issued_source = 'typed' where user_id = pg_temp.u('3');
set local role service_role;
select test.rows('a typed date nobody checked starts no reminder', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('3')$$, 0);
select test.rows('a file without a date starts no reminder', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('2')$$, 0);
reset role;
update public.member_documents set issued_source = 'read' where user_id = pg_temp.u('3');
set local role service_role;
select test.rows('a date read from the file starts reminders', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('3')$$, 1);
reset role;

\echo == old rows keep working
-- An old row: an end date typed before this migration, no date of issue, with a file. Written past the new rules,
-- the way the old app did, then the rule is put back as "not valid" exactly as the migration does.
delete from public.member_documents where user_id = pg_temp.u('2');
alter table public.member_documents drop constraint member_documents_date_needs_file;
alter table public.member_documents disable trigger member_documents_stamp;
insert into public.member_documents (user_id, kind, valid_until, file_path) values (pg_temp.u('2'), 'medical_certificate', current_date + 100, pg_temp.f('2', 'medical_certificate-2000000000.pdf'));
alter table public.member_documents enable trigger member_documents_stamp;
alter table public.member_documents add constraint member_documents_date_needs_file
  check (kind <> 'medical_certificate' or (valid_until is null and issued_on is null) or file_path is not null) not valid;
select test.login(pg_temp.u('2'));
select test.rows('an old row is still readable and has no date of issue', $$select 1 from public.member_documents where valid_until = current_date + 100 and issued_on is null$$, 1);
select test.works('an old row can have its file replaced and keeps its end date', $$update public.member_documents set file_path = pg_temp.f('2', 'medical_certificate-2000000011.pdf') where user_id = pg_temp.u('2')$$);
select test.rows('the end date of an old row is kept', $$select 1 from public.member_documents where valid_until = current_date + 100$$, 1);
select test.works('the player gives the date of issue of an old row', $$update public.member_documents set issued_on = current_date - 40, issued_source = 'typed' where user_id = pg_temp.u('2')$$);
select test.rows('then the end date follows it', $$select 1 from public.member_documents where user_id = pg_temp.u('2') and valid_until = (current_date - 40 + interval '1 year')::date$$, 1);
select test.logout();
rollback;
\echo ALL CERTIFICATE ISSUE DATE TESTS PASSED
