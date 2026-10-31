begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;

\echo == the board adds
select test.login(pg_temp.u('b1'));
select test.works('the board adds a document', $$insert into storage.objects (bucket_id, name) values ('documents', 'club/doc-2000000001.pdf')$$);
select test.works('and its title', $$insert into public.club_documents (title, file_path, created_by) values ('Statuto', 'club/doc-2000000001.pdf', pg_temp.u('b1'))$$);
select test.fails('a path outside the pattern is refused', $$insert into public.club_documents (title, file_path, created_by) values ('Altro', 'club/other.pdf', pg_temp.u('b1'))$$, 'club_documents_file_path_check');
select test.fails('an empty title is refused', $$insert into public.club_documents (title, file_path, created_by) values ('  ', 'club/doc-2000000002.pdf', pg_temp.u('b1'))$$, 'club_documents_title_check');
select test.fails('the board cannot write under another person', $$insert into public.club_documents (title, file_path, created_by) values ('Moduli', 'club/doc-2000000003.pdf', pg_temp.u('1'))$$, 'row-level security');
select test.fails('the board cannot upload any file name into the club folder', $$insert into storage.objects (bucket_id, name) values ('documents', 'club/evil.html')$$, 'row-level security');
select test.works('the board renames a document', $$update public.club_documents set title = 'Statuto del club' where file_path = 'club/doc-2000000001.pdf'$$);
select test.logout();

\echo == members read
select test.login(pg_temp.u('1'));
select test.rows('a player reads the list', $$select 1 from public.club_documents where title = 'Statuto del club'$$, 1);
select test.rows('a player reads the file', $$select 1 from storage.objects where bucket_id = 'documents' and name = 'club/doc-2000000001.pdf'$$, 1);
select test.fails('a player cannot add a title', $$insert into public.club_documents (title, file_path, created_by) values ('X', 'club/doc-2000000004.pdf', pg_temp.u('1'))$$, 'row-level security');
select test.fails('a player cannot upload a club file', $$insert into storage.objects (bucket_id, name) values ('documents', 'club/doc-2000000004.pdf')$$, 'row-level security');
select test.affected('a player cannot rename', $$update public.club_documents set title = 'Hack'$$, 0);
select test.affected('a player cannot remove the title', $$delete from public.club_documents$$, 0);
select test.affected('a player cannot remove the file', $$delete from storage.objects where name = 'club/doc-2000000001.pdf'$$, 0);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('a coach reads the list', $$select 1 from public.club_documents$$, 1);
select test.fails('a coach cannot upload a club file', $$insert into storage.objects (bucket_id, name) values ('documents', 'club/doc-2000000005.pdf')$$, 'row-level security');
select test.fails('a coach cannot add a title', $$insert into public.club_documents (title, file_path, created_by) values ('X', 'club/doc-2000000005.pdf', pg_temp.u('c1'))$$, 'row-level security');
select test.logout();
select test.login(pg_temp.u('9'));
select test.rows('an account without a profile reads nothing', $$select 1 from public.club_documents$$, 0);
select test.rows('and no file', $$select 1 from storage.objects where name = 'club/doc-2000000001.pdf'$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read the list', $$select 1 from public.club_documents$$, 'permission denied');
select test.logout();

\echo == the board removes
select test.login(pg_temp.u('b1'));
select test.affected('the board removes the file', $$delete from storage.objects where name = 'club/doc-2000000001.pdf'$$, 1);
select test.affected('and the title', $$delete from public.club_documents$$, 1);
select test.logout();
rollback;
\echo ALL CLUB DOCUMENT TESTS PASSED
