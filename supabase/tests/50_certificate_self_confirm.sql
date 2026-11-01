begin;

-- Staff may confirm their own certificate (decision 129). The record says who confirmed, so it stays honest.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.f(p text, f text) returns text language sql as $$ select pg_temp.u(p)::text || '/' || f $$;

\echo == a board member confirms their own certificate
select test.login(pg_temp.u('b1'));
select test.works('the board member uploads their own certificate', $$insert into public.member_documents (user_id, kind, file_path, issued_on, issued_source) values (pg_temp.u('b1'), 'medical_certificate', pg_temp.f('b1', 'medical_certificate-2000000000.pdf'), current_date - 7, 'typed')$$);
select test.rows('it waits for staff', $$select 1 from public.member_documents where user_id = pg_temp.u('b1') and verified_at is null$$, 1);
select test.works('the board member confirms their own date', $$select public.verify_certificate(pg_temp.u('b1'), current_date - 7)$$);
select test.rows('the record shows the person themselves as the one who confirmed', $$select 1 from public.member_documents where user_id = pg_temp.u('b1') and verified_by = pg_temp.u('b1') and verified_at is not null$$, 1);
select test.rows('the end date follows', $$select 1 from public.member_documents where user_id = pg_temp.u('b1') and valid_until = (current_date - 7 + interval '1 year')::date$$, 1);
select test.works('a new file starts the review again', $$update public.member_documents set file_path = pg_temp.f('b1', 'medical_certificate-2000000005.pdf') where user_id = pg_temp.u('b1')$$);
select test.rows('the confirmation is cleared by the new file', $$select 1 from public.member_documents where user_id = pg_temp.u('b1') and verified_at is null and verified_by is null$$, 1);
select test.works('the board member confirms again', $$select public.verify_certificate(pg_temp.u('b1'), current_date - 7)$$);
select test.logout();

\echo == a coach confirms their own certificate, and another staff member checks it again
select test.login(pg_temp.u('c1'));
select test.works('the coach uploads their own certificate', $$insert into public.member_documents (user_id, kind, file_path) values (pg_temp.u('c1'), 'medical_certificate', pg_temp.f('c1', 'medical_certificate-2000000000.jpg'))$$);
select test.works('the coach types the date', $$update public.member_documents set issued_on = current_date - 2, issued_source = 'typed' where user_id = pg_temp.u('c1')$$);
select test.works('the coach confirms their own certificate', $$select public.verify_certificate(pg_temp.u('c1'), current_date - 2)$$);
select test.rows('the coach is the one recorded', $$select 1 from public.member_documents where user_id = pg_temp.u('c1') and verified_by = pg_temp.u('c1')$$, 1);
select test.logout();
select test.login(pg_temp.u('b1'));
select test.works('the board checks the coach certificate again', $$select public.verify_certificate(pg_temp.u('c1'), current_date - 3)$$);
select test.rows('the record now shows the board member', $$select 1 from public.member_documents where user_id = pg_temp.u('c1') and verified_by = pg_temp.u('b1') and issued_on = current_date - 3$$, 1);
select test.logout();

\echo == a player cannot confirm, not even their own
select test.login(pg_temp.u('1'));
select test.works('the player uploads a certificate', $$insert into public.member_documents (user_id, kind, file_path, issued_on, issued_source) values (pg_temp.u('1'), 'medical_certificate', pg_temp.f('1', 'medical_certificate-2000000000.pdf'), current_date - 4, 'typed')$$);
select test.fails('the player cannot confirm their own certificate', $$select public.verify_certificate(pg_temp.u('1'), current_date - 4)$$, 'staff only');
select test.fails('the player cannot write the verifier', $$update public.member_documents set verified_by = pg_temp.u('1'), verified_at = now() where user_id = pg_temp.u('1')$$, 'permission denied');
select test.rows('the player certificate still waits', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and verified_at is null$$, 1);
select test.logout();

rollback;
\echo ALL CERTIFICATE SELF CONFIRM TESTS PASSED
