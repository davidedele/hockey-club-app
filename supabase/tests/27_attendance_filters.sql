begin;

-- People: board1 and coach1 with no group. p1 in A (forward), p2 in A and B (defence), p3 in C1 (goalie).
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now());
insert into public.profiles (id, first_name, last_name, position) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board', null),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach', null),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One', 'forward'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two', 'defence'),
  ('00000000-0000-0000-0000-000000000003', 'Pip', 'Three', 'goalie');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('A', '00000000-0000-0000-0000-000000000002'),
    ('B', '00000000-0000-0000-0000-000000000002'),
    ('C1', '00000000-0000-0000-0000-000000000003')) v(code, uid)
  join public.groups g on g.code = v.code;

create function pg_temp.mk(p_id text, p_type public.event_type, p_days integer, p_group text, p_group2 text default null) returns void
language plpgsql as $$
declare v_id uuid := ('00000000-0000-0000-0000-' || lpad(p_id, 12, '0'))::uuid;
begin
  insert into public.events (id, type, title, starts_at, ends_at)
    values (v_id, p_type, p_id, now() + (p_days || ' days')::interval, now() + (p_days || ' days')::interval + interval '1 hour');
  insert into public.event_groups select v_id, id from public.groups where code in (p_group, p_group2);
end $$;
-- Finished: f1 training A, f2 training A and B, f3 training C1, a1 game A, f5 training B, f4 cancelled training A.
-- Upcoming: b1 training A.
select pg_temp.mk('f1', 'training', -2, 'A');
select pg_temp.mk('f2', 'training', -5, 'A', 'B');
select pg_temp.mk('f3', 'training', -2, 'C1');
select pg_temp.mk('a1', 'game', -3, 'A');
select pg_temp.mk('f5', 'training', -1, 'B');
select pg_temp.mk('f4', 'training', -4, 'A');
select pg_temp.mk('b1', 'training', 3, 'A');
update public.events set cancelled_at = now() where title = 'f4';
insert into public.attendance_answers (event_id, user_id, answer) values
  ((select id from public.events where title = 'f1'), '00000000-0000-0000-0000-000000000001', 'present');

\echo == who may open it
select test.login('00000000-0000-0000-0000-000000000001');
select test.fails('a player cannot open the summary', $$select * from public.attendance_summary(null, null, null, null)$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot open the summary', $$select * from public.attendance_summary(null, null, null, 'game')$$, 'permission denied');
select test.logout();

\echo == filters
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.rows('no filter: everyone with a finished event', $$select * from public.attendance_summary()$$, 3);
select test.rows('no filter: a person in two groups counts each event once', $$select * from public.attendance_summary() where last_name = 'Two' and events_total = 4$$, 1);
select test.rows('cancelled and upcoming events are left out', $$select * from public.attendance_summary() where last_name = 'One' and events_total = 3$$, 1);
select test.rows('group A: only its people', $$select * from public.attendance_summary(null, null, (select id from public.groups where code = 'A'), null)$$, 2);
select test.rows('group A: only the events of group A', $$select * from public.attendance_summary(null, null, (select id from public.groups where code = 'A'), null) where last_name = 'Two' and events_total = 3$$, 1);
select test.rows('group B: the person of B counts the events of B', $$select * from public.attendance_summary(null, null, (select id from public.groups where code = 'B'), null) where last_name = 'Two' and events_total = 2$$, 1);
select test.rows('group B: a person of another group is not listed', $$select * from public.attendance_summary(null, null, (select id from public.groups where code = 'B'), null) where last_name = 'One'$$, 0);
select test.rows('group C1: only its person', $$select * from public.attendance_summary(null, null, (select id from public.groups where code = 'C1'), null)$$, 1);
select test.rows('an unknown group lists nobody', $$select * from public.attendance_summary(null, null, 999::smallint, null)$$, 0);
select test.rows('games only', $$select * from public.attendance_summary(null, null, null, 'game') where events_total = 1$$, 2);
select test.rows('games only leave out people with no game', $$select * from public.attendance_summary(null, null, null, 'game') where last_name = 'Three'$$, 0);
select test.rows('trainings only', $$select * from public.attendance_summary(null, null, null, 'training') where last_name = 'One' and events_total = 2$$, 1);
select test.rows('group and type together', $$select * from public.attendance_summary(null, null, (select id from public.groups where code = 'A'), 'training') where last_name = 'Two' and events_total = 2$$, 1);
select test.rows('a date range still limits the events', $$select * from public.attendance_summary(now() - interval '2.5 days', now()) where last_name = 'One' and events_total = 1$$, 1);
select test.rows('the end of a date range limits the events', $$select * from public.attendance_summary(now() - interval '6 days', now() - interval '3.5 days') where last_name = 'One' and events_total = 1$$, 1);
select test.rows('answers are counted inside a filter', $$select * from public.attendance_summary(null, null, (select id from public.groups where code = 'A'), 'training') where last_name = 'One' and answered_present = 1 and no_answer = 1$$, 1);

\echo == position
select test.rows('the position of each person is given', $$select * from public.attendance_summary() where (last_name, "position") in (('One', 'forward'), ('Two', 'defence'), ('Three', 'goalie'))$$, 3);
select test.logout();

\echo == the board
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.rows('the board can open it too', $$select * from public.attendance_summary(null, null, null, 'game')$$, 2);
select test.logout();

rollback;
