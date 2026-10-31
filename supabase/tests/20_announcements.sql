begin;

-- People: coach1 and p1, p2, p4, p5 in A, p3 in B, coach2 and board1 in no group, p6 without a profile.
insert into auth.users (id, email, email_confirmed_at)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'p' || n || '@example.test', now() from generate_series(1, 6) n;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c2', 'coach2@example.test', now());
insert into public.profiles (id, first_name, last_name)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'Nome' || chr(64 + n), 'Cognome' || chr(64 + n) from generate_series(1, 5) n;
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-0000000000c2', 'Carlo', 'Coach');
insert into public.profile_contacts (user_id, email)
  select id, id::text || '@example.test' from public.profiles;
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach'),
  ('00000000-0000-0000-0000-0000000000c2', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('A', '00000000-0000-0000-0000-000000000002'),
    ('B', '00000000-0000-0000-0000-000000000003'),
    ('A', '00000000-0000-0000-0000-000000000004'),
    ('A', '00000000-0000-0000-0000-000000000005'),
    ('A', '00000000-0000-0000-0000-0000000000c1')) v(code, uid)
  join public.groups g on g.code = v.code;
insert into public.reminder_prefs (user_id, enabled) values ('00000000-0000-0000-0000-000000000004', false);

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create temp table base as select ((now() at time zone 'Europe/Rome')::date + time '12:00') at time zone 'Europe/Rome' as t;
grant select on base to service_role;
grant usage on schema test to service_role;
create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated, service_role;

\echo == who can write
select test.login(pg_temp.u('1'));
select test.fails('a player cannot post', $$select public.post_announcement('Titolo', 'Testo', array[1]::smallint[], false)$$, 'forbidden');
select test.fails('a player cannot write directly', $$insert into public.announcements (title, body) values ('x', 'y')$$, 'permission denied');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot post', $$select public.post_announcement('Titolo', 'Testo', array[1]::smallint[], false)$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.fails('no group', $$select public.post_announcement('Titolo', 'Testo', array[]::smallint[], false)$$, 'groups_required');
select test.fails('a group that does not exist', $$select public.post_announcement('Titolo', 'Testo', array[99]::smallint[], false)$$, 'groups_required');
select test.fails('an empty title', $$select public.post_announcement('   ', 'Testo', (select array_agg(id) from public.groups where code = 'A')::smallint[], false)$$, 'announcement_invalid');
select test.fails('an empty text', $$select public.post_announcement('Titolo', '', (select array_agg(id) from public.groups where code = 'A')::smallint[], false)$$, 'announcement_invalid');
select test.fails('a title over 80 characters', $$select public.post_announcement(repeat('x', 81), 'Testo', (select array_agg(id) from public.groups where code = 'A')::smallint[], false)$$, 'announcement_invalid');
select test.fails('a text over 2000 characters', $$select public.post_announcement('Titolo', repeat('x', 2001), (select array_agg(id) from public.groups where code = 'A')::smallint[], false)$$, 'announcement_invalid');
insert into ids select 'a1', public.post_announcement('  Cambio orario ', ' Giovedì si gioca alle 21. ', (select array_agg(id) from public.groups where code = 'A')::smallint[], true);
insert into ids select 'a2', public.post_announcement('Solo nell''app', 'Nessuna email.', (select array_agg(id) from public.groups where code = 'A')::smallint[], false);
select test.rows('a coach posted two announcements', $$select 1 from public.announcements$$, 2);
select test.rows('title and text are trimmed', $$select 1 from public.announcements where title = 'Cambio orario' and body = 'Giovedì si gioca alle 21.'$$, 1);
select test.rows('the writer is recorded', $$select 1 from public.announcements where author_id = pg_temp.u('c1')$$, 2);
select test.logout();
select test.login(pg_temp.u('b1'));
insert into ids select 'a3', public.post_announcement('Assemblea', 'Sabato alle 18.', (select array_agg(id) from public.groups where code in ('A', 'B'))::smallint[], true);
select test.rows('the board posts to two groups', $$select 1 from public.announcement_groups where announcement_id = (select id from ids where name = 'a3')$$, 2);
select test.logout();

\echo == who can read
select test.login(pg_temp.u('1'));
select test.rows('a member of A reads the three', $$select 1 from public.announcements$$, 3);
select test.rows('and the groups of each', $$select 1 from public.announcement_groups$$, 4);
select test.logout();
select test.login(pg_temp.u('3'));
select test.rows('a member of B reads only the one for B', $$select 1 from public.announcements$$, 1);
select test.rows('and only its groups', $$select 1 from public.announcement_groups$$, 2);
select test.logout();
select test.login(pg_temp.u('c2'));
select test.rows('a coach reads all, in a group or not', $$select 1 from public.announcements$$, 3);
select test.logout();
select test.login(pg_temp.u('6'));
select test.rows('someone without a profile reads none', $$select 1 from public.announcements$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read', $$select 1 from public.announcements$$, 'permission denied');
select test.logout();

\echo == deleting
select test.login(pg_temp.u('1'));
select test.affected('a member cannot delete', $$delete from public.announcements$$, 0);
select test.fails('a member cannot edit', $$update public.announcements set title = 'x'$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('c2'));
select test.affected('another coach cannot delete the announcements of someone else', $$delete from public.announcements where id = (select id from ids where name = 'a2')$$, 0);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.affected('the writer deletes their own', $$delete from public.announcements where id = (select id from ids where name = 'a2')$$, 1);
insert into ids select 'a4', public.post_announcement('Solo nell''app 2', 'Senza email.', (select array_agg(id) from public.groups where code = 'A')::smallint[], false);
insert into ids select 'a5', public.post_announcement('Da togliere', 'Errore.', (select array_agg(id) from public.groups where code = 'A')::smallint[], false);
select test.affected('a coach cannot delete the board announcement', $$delete from public.announcements where id = (select id from ids where name = 'a3')$$, 0);
select test.logout();

select test.login(pg_temp.u('b1'));
select test.affected('the board deletes the announcement of a coach', $$delete from public.announcements where id = (select id from ids where name = 'a5')$$, 1);
select test.logout();

\echo == seen
select test.login(pg_temp.u('1'));
select test.works('a member marks everything as seen', $$select public.mark_announcements_seen()$$);
select test.works('twice is fine', $$select public.mark_announcements_seen()$$);
select test.rows('they read their own mark', $$select 1 from public.announcement_seen$$, 1);
select test.fails('they cannot write the mark directly', $$update public.announcement_seen set seen_at = now() - interval '1 year'$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('2'));
select test.rows('another member sees no one else mark', $$select 1 from public.announcement_seen$$, 0);
select test.logout();
select test.login(pg_temp.u('6'));
select test.fails('someone without a profile cannot mark', $$select public.mark_announcements_seen()$$, 'forbidden');
select test.logout();

\echo == emails
set local role service_role;
select test.rows('p1 is due the two announcements with an email', $$select 1 from public.announcements_due((select t from base)) where user_id = pg_temp.u('1')$$, 2);
select test.rows('the one for A and B reaches five people (the writer is a non member)', $$select 1 from public.announcements_due((select t from base)) where announcement_id = (select id from ids where name = 'a3')$$, 5);
select test.rows('the one by the coach reaches three: not the writer, not who switched off', $$select 1 from public.announcements_due((select t from base)) where announcement_id = (select id from ids where name = 'a1')$$, 3);
select test.rows('the writer gets no email of their own message', $$select 1 from public.announcements_due((select t from base)) where user_id = pg_temp.u('c1') and announcement_id = (select id from ids where name = 'a1')$$, 0);
select test.rows('but gets the board one', $$select 1 from public.announcements_due((select t from base)) where user_id = pg_temp.u('c1') and announcement_id = (select id from ids where name = 'a3')$$, 1);
select test.rows('someone who switched emails off gets nothing', $$select 1 from public.announcements_due((select t from base)) where user_id = pg_temp.u('4')$$, 0);
select test.rows('a member of B gets only the one for B', $$select 1 from public.announcements_due((select t from base)) where user_id = pg_temp.u('3')$$, 1);
select test.rows('a coach outside the groups gets nothing', $$select 1 from public.announcements_due((select t from base)) where user_id = pg_temp.u('c2')$$, 0);
select test.rows('the email and names are returned for sending', $$select 1 from public.announcements_due((select t from base)) where user_id = pg_temp.u('1') and email like '%@example.test' and first_name = 'NomeA' and author_name = 'Cora Coach' and group_names is not null and title = 'Cambio orario'$$, 1);
select test.rows('nothing at 03:00', $$select 1 from public.announcements_due((select t from base) - interval '9 hours')$$, 0);
select test.rows('nothing at 22:00', $$select 1 from public.announcements_due((select t from base) + interval '10 hours')$$, 0);
select test.works('the server marks one as sent', $$select public.announcements_mark_sent(pg_temp.u('1'), array[(select id from ids where name = 'a1')])$$);
select test.rows('it is not due again for p1', $$select 1 from public.announcements_due((select t from base)) where user_id = pg_temp.u('1') and announcement_id = (select id from ids where name = 'a1')$$, 0);
select test.rows('the other one is still due for p1', $$select 1 from public.announcements_due((select t from base)) where user_id = pg_temp.u('1') and announcement_id = (select id from ids where name = 'a3')$$, 1);
select test.works('marking twice is harmless', $$select public.announcements_mark_sent(pg_temp.u('1'), array[(select id from ids where name = 'a1')])$$);
select test.rows('p2 still gets the first one', $$select 1 from public.announcements_due((select t from base)) where user_id = pg_temp.u('2') and announcement_id = (select id from ids where name = 'a1')$$, 1);
select test.rows('an announcement older than three days is never sent', $$select 1 from public.announcements_due((select t from base) + interval '4 days')$$, 0);
reset role;
select test.login(pg_temp.u('1'));
select test.fails('a player cannot ask who is due', $$select * from public.announcements_due()$$, 'permission denied');
select test.fails('a player cannot mark as sent', $$select public.announcements_mark_sent(pg_temp.u('1'), array[(select id from ids where name = 'a3')])$$, 'permission denied');
select test.fails('a player cannot read the log', $$select 1 from public.announcement_log$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('b1'));
select test.fails('not even the board can read the log', $$select 1 from public.announcement_log$$, 'permission denied');
select test.logout();

\echo == removing
delete from public.profiles where id = pg_temp.u('c1');
select test.rows('an announcement stays when its writer is removed', $$select 1 from public.announcements where author_id is null$$, 2);
delete from public.announcements where id = (select id from ids where name = 'a1');
select test.rows('the log of a deleted announcement is gone', $$select 1 from public.announcement_log$$, 0);
