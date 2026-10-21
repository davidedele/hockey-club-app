begin;

-- People: board1 (board), coach1 (coach), p1 (A), p2 (A and B), p3 (C1).
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
  ('00000000-0000-0000-0000-000000000003', 'Pip', 'Three');
insert into public.profile_contacts (user_id, email, phone)
  select p.id, u.email, '333' from public.profiles p join auth.users u using (id);
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

-- Upcoming: e1 (A, in 2 days), e2 (A and B, in 3 days), e3 (C1, in 1 day), e5 (A, in 20 days).
-- Finished: f1 (A, 2 days ago), f2 (A and B, 5 days ago), f3 (C1, 2 days ago).
create function pg_temp.mk(p_id text, p_starts interval, p_group text, p_group2 text default null) returns void
language plpgsql as $$
declare v_id uuid := ('00000000-0000-0000-0000-' || lpad(p_id, 12, '0'))::uuid;
begin
  insert into public.events (id, type, title, starts_at, ends_at)
    values (v_id, 'training', p_id, now() + p_starts, now() + p_starts + interval '1 hour');
  insert into public.event_groups select v_id, id from public.groups where code in (p_group, p_group2);
end $$;
select pg_temp.mk('e1', interval '2 days', 'A');
select pg_temp.mk('e2', interval '3 days', 'A', 'B');
select pg_temp.mk('e3', interval '1 day', 'C1');
select pg_temp.mk('e5', interval '20 days', 'A');
select pg_temp.mk('f1', interval '-2 days', 'A');
select pg_temp.mk('f2', interval '-5 days', 'A', 'B');
select pg_temp.mk('f3', interval '-2 days', 'C1');
-- p1 answered e1. In the past, p1 said present for f1 and p2 said absent for f1.
insert into public.attendance_answers (event_id, user_id, answer) values
  ((select id from public.events where title = 'e1'), '00000000-0000-0000-0000-000000000001', 'present'),
  ((select id from public.events where title = 'f1'), '00000000-0000-0000-0000-000000000001', 'present'),
  ((select id from public.events where title = 'f1'), '00000000-0000-0000-0000-000000000002', 'absent');
insert into public.attendance_records (event_id, user_id, status) values
  ((select id from public.events where title = 'f2'), '00000000-0000-0000-0000-000000000001', 'late');

\echo == who has not answered
select test.login('00000000-0000-0000-0000-000000000001');
select test.fails('player cannot open the list of non answers', $$select * from public.unanswered_people()$$, 'forbidden');
select test.fails('player cannot open the summary', $$select * from public.attendance_summary()$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot open the list of non answers', $$select * from public.unanswered_people()$$, 'permission denied');
select test.fails('anonymous cannot open the summary', $$select * from public.attendance_summary()$$, 'permission denied');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.rows('three people have something unanswered this week', $$select * from public.unanswered_people()$$, 3);
select test.rows('a person in two groups of one event counts it once', $$select * from public.unanswered_people() where last_name = 'Two' and missing = 2$$, 1);
select test.rows('an answered event is not counted', $$select * from public.unanswered_people() where last_name = 'One' and missing = 1$$, 1);
select test.rows('events beyond the window are left out', $$select * from public.unanswered_people() where last_name = 'One' and missing = 2$$, 0);
select test.rows('a wider window includes them', $$select * from public.unanswered_people(30) where last_name = 'One' and missing = 2$$, 1);
select test.rows('finished events are never counted', $$select * from public.unanswered_people(30) where last_name = 'Three' and missing = 1$$, 1);
select test.rows('contacts are included', $$select * from public.unanswered_people() where email like '%@example.test' and phone = '333'$$, 3);
select test.rows('the most missing comes first', $$select * from (select row_number() over () n, last_name from public.unanswered_people()) x where n = 1 and last_name = 'Two'$$, 1);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.rows('the board can open the list too', $$select * from public.unanswered_people()$$, 3);
select test.logout();

\echo == attendance summary
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.rows('three players appear in the summary', $$select * from public.attendance_summary()$$, 3);
select test.rows('a player in two groups counts a shared event once', $$select * from public.attendance_summary() where last_name = 'Two' and events_total = 2$$, 1);
select test.rows('answers and recorded status are counted', $$select * from public.attendance_summary() where last_name = 'One' and events_total = 2 and answered_present = 1 and no_answer = 1 and late = 1$$, 1);
select test.rows('an absent answer is counted', $$select * from public.attendance_summary() where last_name = 'Two' and answered_absent = 1 and no_answer = 1$$, 1);
select test.rows('upcoming events are not in the summary', $$select * from public.attendance_summary() where events_total > 2$$, 0);
select test.rows('a date range limits the events', $$select * from public.attendance_summary(now() - interval '3 days', now()) where last_name = 'One' and events_total = 1 and late = 0$$, 1);
select test.logout();

rollback;
\echo ALL STAFF LIST TESTS PASSED
