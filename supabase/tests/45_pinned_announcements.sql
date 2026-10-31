begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000004', 'Pat', 'Four');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board'), ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values ('A', '00000000-0000-0000-0000-000000000001'), ('C1', '00000000-0000-0000-0000-000000000004')) v(code, uid)
  join public.groups g on g.code = v.code;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create temp table made (id uuid);
grant select, insert on made to authenticated;

select test.login(pg_temp.u('c1'));
insert into made select public.post_announcement('Per A', 'Testo', array[(select id from public.groups where code = 'A')]::smallint[], false);
select test.logout();

\echo == who may pin
select test.login(pg_temp.u('c1'));
select test.fails('a coach cannot pin', $$select public.pin_announcement((select id from made), true)$$, 'forbidden');
select test.logout();
select test.login(pg_temp.u('1'));
select test.fails('a player cannot pin', $$select public.pin_announcement((select id from made), true)$$, 'forbidden');
select test.fails('and cannot update it directly', $$update public.announcements set pinned_at = now()$$, 'permission denied');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot pin', $$select public.pin_announcement(gen_random_uuid(), true)$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('b1'));
select test.fails('an unknown announcement is refused', $$select public.pin_announcement(gen_random_uuid(), true)$$, 'not_found');
select test.works('the board pins', $$select public.pin_announcement((select id from made), true)$$);
select test.rows('it is pinned', $$select 1 from public.announcements where pinned_at is not null$$, 1);
select test.logout();

\echo == who sees it
select test.login(pg_temp.u('1'));
select test.rows('a member of the group sees it pinned', $$select 1 from public.announcements where pinned_at is not null$$, 1);
select test.logout();
select test.login(pg_temp.u('4'));
select test.rows('a member of another group still does not see it', $$select 1 from public.announcements$$, 0);
select test.logout();
select test.login(pg_temp.u('b1'));
select test.works('the board unpins', $$select public.pin_announcement((select id from made), false)$$);
select test.rows('it is not pinned', $$select 1 from public.announcements where pinned_at is not null$$, 0);
select test.logout();
rollback;
\echo ALL PINNED ANNOUNCEMENT TESTS PASSED
