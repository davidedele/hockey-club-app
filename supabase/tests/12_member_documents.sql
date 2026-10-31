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
create function pg_temp.f(p text, f text) returns text language sql as $$ select pg_temp.u(p)::text || '/' || f $$;

\echo == certificate
select test.login(pg_temp.u('1'));
select test.works('a player uploads their certificate file', $$insert into storage.objects (bucket_id, name) values ('documents', pg_temp.f('1', 'medical_certificate-2000000000.pdf'))$$);
select test.fails('a player cannot upload into someone else''s folder', $$insert into storage.objects (bucket_id, name) values ('documents', pg_temp.f('2', 'medical_certificate-2000000000.pdf'))$$, 'row-level security');
select test.works('a player records their certificate', $$insert into public.member_documents (user_id, kind, issued_on, issued_source, file_path) values (pg_temp.u('1'), 'medical_certificate', current_date - 165, 'read', pg_temp.f('1', 'medical_certificate-2000000000.pdf'))$$);
select test.rows('who wrote it is recorded', $$select 1 from public.member_documents where user_id = pg_temp.u('1') and updated_by = pg_temp.u('1')$$, 1);
select test.fails('the file must sit in the member''s own folder', $$update public.member_documents set file_path = pg_temp.f('2', 'medical_certificate-2000000000.pdf') where user_id = pg_temp.u('1')$$, 'check constraint');
select test.fails('a player cannot record a certificate for someone else', $$insert into public.member_documents (user_id, kind, issued_on, issued_source) values (pg_temp.u('2'), 'medical_certificate', current_date - 10, 'typed')$$, 'row-level security');
select test.fails('who wrote it cannot be set by hand', $$insert into public.member_documents (user_id, kind, updated_by) values (pg_temp.u('1'), 'medical_certificate', pg_temp.u('2'))$$, 'permission denied');
select test.logout();

select test.login(pg_temp.u('2'));
select test.rows('another player does not see the certificate', $$select * from public.member_documents$$, 0);
select test.rows('another player does not see the file', $$select * from storage.objects where bucket_id = 'documents'$$, 0);
select test.affected('another player cannot change it', $$update public.member_documents set issued_on = current_date where user_id = pg_temp.u('1')$$, 0);
select test.affected('another player cannot remove the file', $$delete from storage.objects where bucket_id = 'documents'$$, 0);
select test.logout();

select test.login(pg_temp.u('c1'));
select test.rows('a coach sees the certificate', $$select 1 from public.member_documents where user_id = pg_temp.u('1')$$, 1);
select test.rows('a coach sees the file', $$select 1 from storage.objects where bucket_id = 'documents' and name = pg_temp.f('1', 'medical_certificate-2000000000.pdf')$$, 1);
select test.works('a coach uploads a certificate for a player', $$insert into storage.objects (bucket_id, name) values ('documents', pg_temp.f('2', 'medical_certificate-2000000001.jpg'))$$);
select test.works('a coach records it', $$insert into public.member_documents (user_id, kind, issued_on, issued_source, file_path) values (pg_temp.u('2'), 'medical_certificate', current_date - 335, 'typed', pg_temp.f('2', 'medical_certificate-2000000001.jpg'))$$);
select test.fails('staff cannot upload into a folder that is not a member', $$insert into storage.objects (bucket_id, name) values ('documents', pg_temp.f('9', 'medical_certificate-2000000001.jpg'))$$, 'row-level security');
select test.fails('staff cannot upload the privacy notice unless board', $$insert into storage.objects (bucket_id, name) values ('documents', 'club/privacy-2000000000.pdf')$$, 'row-level security');
select test.logout();

\echo == privacy notice and consent
select test.login(pg_temp.u('b1'));
select test.works('the board uploads the privacy notice', $$insert into storage.objects (bucket_id, name) values ('documents', 'club/privacy-2000000000.pdf')$$);
select test.affected('the board sets it as the club notice', $$update public.club_settings set privacy_notice_path = 'club/privacy-2000000000.pdf'$$, 1);
select test.fails('the notice is a PDF in the club folder', $$update public.club_settings set privacy_notice_path = 'club/logo-2000000000.png'$$, 'check constraint');
select test.fails('the board cannot accept for a player', $$insert into public.member_documents (user_id, kind, accepted_at, file_path) values (pg_temp.u('1'), 'privacy_consent', now(), 'club/privacy-2000000000.pdf')$$, 'row-level security');
select test.logout();

select test.login(pg_temp.u('c1'));
select test.affected('a coach cannot set the notice', $$update public.club_settings set privacy_notice_path = null$$, 0);
select test.logout();

select test.login(pg_temp.u('1'));
select test.rows('a member reads the notice', $$select 1 from storage.objects where bucket_id = 'documents' and name = 'club/privacy-2000000000.pdf'$$, 1);
select test.works('a player accepts the notice', $$insert into public.member_documents (user_id, kind, accepted_at, file_path) values (pg_temp.u('1'), 'privacy_consent', '2001-01-01', 'club/privacy-2000000000.pdf')$$);
select test.rows('the moment of consent cannot be backdated', $$select 1 from public.member_documents where kind = 'privacy_consent' and accepted_at > now() - interval '1 minute'$$, 1);
select test.fails('a consent has no date of issue', $$update public.member_documents set issued_on = current_date, issued_source = 'typed' where kind = 'privacy_consent'$$, 'check constraint');
select test.fails('a player cannot upload the notice', $$insert into storage.objects (bucket_id, name) values ('documents', 'club/privacy-3000000000.pdf')$$, 'row-level security');
select test.affected('a player withdraws their consent', $$delete from public.member_documents where kind = 'privacy_consent'$$, 1);
select test.logout();

select test.login(pg_temp.u('2'));
select test.works('another player accepts too', $$insert into public.member_documents (user_id, kind, accepted_at) values (pg_temp.u('2'), 'privacy_consent', now())$$);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('staff see consents', $$select 1 from public.member_documents where kind = 'privacy_consent'$$, 1);
select test.affected('staff cannot withdraw a consent', $$delete from public.member_documents where kind = 'privacy_consent'$$, 0);
select test.affected('staff cannot change a consent', $$update public.member_documents set file_path = null where kind = 'privacy_consent'$$, 0);
select test.affected('staff can remove a certificate', $$delete from public.member_documents where kind = 'medical_certificate' and user_id = pg_temp.u('2')$$, 1);
select test.logout();

\echo == outsiders
select test.login(pg_temp.u('9'));
select test.rows('an account without a profile sees nothing', $$select * from public.member_documents$$, 0);
select test.rows('an account without a profile sees no files, not even the notice', $$select * from storage.objects where bucket_id = 'documents'$$, 0);
select test.fails('an account without a profile cannot upload', $$insert into storage.objects (bucket_id, name) values ('documents', pg_temp.f('9', 'medical_certificate-2000000000.pdf'))$$, 'row-level security');
select test.fails('an account without a profile cannot record anything', $$insert into public.member_documents (user_id, kind, issued_on, issued_source) values (pg_temp.u('9'), 'medical_certificate', current_date, 'typed')$$, 'row-level security');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read documents', $$select * from public.member_documents$$, 'permission denied');
select test.rows('anonymous sees no files', $$select * from storage.objects where bucket_id = 'documents'$$, 0);
select test.logout();

rollback;
\echo ALL MEMBER DOCUMENT TESTS PASSED
