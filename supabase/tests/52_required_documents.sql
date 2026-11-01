begin;

-- Phase 1 of the settings for what members must provide (decision 132, migration 0054).
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.f(p text, f text) returns text language sql as $$ select pg_temp.u(p)::text || '/' || f $$;
insert into public.profile_contacts (user_id, email) select id, id::text || '@example.test' from public.profiles;
insert into public.group_members (group_id, user_id)
  select (select id from public.groups where code = 'A'), pg_temp.u(x) from unnest(array['1', '2']) x;

\echo == defaults
select test.rows('the certificate is valid 12 months by default', $$select 1 from public.club_settings where certificate_months = 12$$, 1);
select test.rows('staff review is on by default', $$select 1 from public.club_settings where certificate_review$$, 1);
select test.rows('the consent is a button by default', $$select 1 from public.club_settings where consent_mode = 'button'$$, 1);

\echo == a certificate entered with the defaults ends 12 months after the date of issue
select test.login(pg_temp.u('1'));
select test.works('player 1 uploads and gives the date', $$insert into public.member_documents (user_id, kind, file_path, issued_on, issued_source) values (pg_temp.u('1'), 'medical_certificate', pg_temp.f('1', 'medical_certificate-2000000000.pdf'), current_date - 340, 'read')$$);
select test.rows('it ends 12 months after', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and valid_until = (issued_on + interval '12 months')::date$$, 1);
select test.logout();

\echo == only the board changes the settings
select test.login(pg_temp.u('1'));
select test.affected('a player cannot change the months', $$update public.club_settings set certificate_months = 6$$, 0);
select test.affected('a player cannot change the review switch', $$update public.club_settings set certificate_review = false$$, 0);
select test.affected('a player cannot change the consent mode', $$update public.club_settings set consent_mode = 'tick'$$, 0);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.affected('a coach cannot change the months', $$update public.club_settings set certificate_months = 6$$, 0);
select test.affected('a coach cannot change the consent mode', $$update public.club_settings set consent_mode = 'tick'$$, 0);
select test.logout();
select test.login_anon();
select test.fails('a signed out visitor cannot change them', $$update public.club_settings set certificate_months = 6$$, 'permission denied');
select test.logout();

\echo == the board changes them, and bad values are refused
select test.login(pg_temp.u('b1'));
select test.fails('0 months is refused', $$update public.club_settings set certificate_months = 0$$, 'check constraint');
select test.fails('37 months is refused', $$update public.club_settings set certificate_months = 37$$, 'check constraint');
select test.fails('an unknown consent mode is refused', $$update public.club_settings set consent_mode = 'x'$$, 'check constraint');
select test.fails('the review switch cannot be empty', $$update public.club_settings set certificate_review = null$$, 'not-null');
select test.affected('the board sets 6 months', $$update public.club_settings set certificate_months = 6$$, 1);
select test.affected('the board chooses the tick box', $$update public.club_settings set consent_mode = 'tick'$$, 1);
select test.logout();

\echo == a change applies to certificates entered afterwards; an old one keeps its end date until edited
select test.rows('the certificate entered before keeps 12 months', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and valid_until = (issued_on + interval '12 months')::date$$, 1);
select test.login(pg_temp.u('2'));
select test.works('player 2 enters a certificate after the change', $$insert into public.member_documents (user_id, kind, file_path, issued_on, issued_source) values (pg_temp.u('2'), 'medical_certificate', pg_temp.f('2', 'medical_certificate-2000000000.pdf'), current_date - 10, 'read')$$);
select test.rows('it ends 6 months after the date of issue', $$select 1 from public.member_documents where user_id = pg_temp.u('2') and valid_until = (current_date - 10 + interval '6 months')::date$$, 1);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.works('staff confirm the old certificate without changing the date', $$select public.verify_certificate(pg_temp.u('1'), current_date - 340)$$);
select test.rows('the old end date is kept', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and valid_until = (issued_on + interval '12 months')::date$$, 1);
select test.works('staff correct the date of the old certificate', $$select public.verify_certificate(pg_temp.u('1'), current_date - 300)$$);
select test.rows('an edited date follows the new setting', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and valid_until = (current_date - 300 + interval '6 months')::date$$, 1);
select test.logout();

\echo == the review switch decides whether a typed date starts the reminders
update public.club_settings set certificate_months = 12;
delete from public.member_documents;
select test.login(pg_temp.u('1'));
select test.works('player 1 types a date', $$insert into public.member_documents (user_id, kind, file_path, issued_on, issued_source) values (pg_temp.u('1'), 'medical_certificate', pg_temp.f('1', 'medical_certificate-2000000000.pdf'), current_date - 340, 'typed')$$);
select test.logout();
create function pg_temp.noon() returns timestamptz language sql as $$ select ((now() at time zone 'Europe/Rome')::date::text || ' 12:00 Europe/Rome')::timestamptz $$;
select test.rows('with the review on, a date nobody confirmed sends no reminder', $$select 1 from public.certificates_due(pg_temp.noon())$$, 0);
update public.club_settings set certificate_review = false;
select test.rows('with the review off, the typed date starts the reminders', $$select 1 from public.certificates_due(pg_temp.noon()) where user_id = pg_temp.u('1')$$, 1);
update public.club_settings set certificate_review = true;
select test.rows('switched on again, it waits for staff again', $$select 1 from public.certificates_due(pg_temp.noon())$$, 0);

\echo == a board session that lost the second step cannot change the settings
update public.club_settings set mfa_required_from = now() - interval '1 day';
select test.login(pg_temp.u('b1'));
select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal1')::text, true);
select test.affected('after the date, a plain board session cannot change the months', $$update public.club_settings set certificate_months = 3$$, 0);
select test.logout();
select set_config('request.jwt.claims', '', true);
update public.club_settings set mfa_required_from = null;

\echo == the end date still cannot be typed
select test.login(pg_temp.u('1'));
select test.fails('the end date cannot be written by the member', $$update public.member_documents set valid_until = current_date + 900 where user_id = pg_temp.u('1')$$, 'permission denied');
select test.logout();
rollback;
\echo ALL REQUIRED DOCUMENTS TESTS PASSED
