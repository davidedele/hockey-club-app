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
  select p.id, u.email, '3331112222' from public.profiles p join auth.users u using (id);
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
-- p1 answered e1.
insert into public.attendance_answers (event_id, user_id, answer) values
  ((select id from public.events where title = 'e1'), '00000000-0000-0000-0000-000000000001', 'present');

\echo == the window can end at a given time
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.rows('without a time it is the number of days: three people in a week', $$select 1 from public.unanswered_people()$$, 3);
select test.rows('until 2 days 12 hours: p2 (e1) and p3 (e3), not p1 who answered e1', $$select 1 from public.unanswered_people(7, now() + interval '2 days 12 hours')$$, 2);
select test.rows('p2 misses only e1 there', $$select 1 from public.unanswered_people(7, now() + interval '2 days 12 hours') where last_name = 'Two' and missing = 1$$, 1);
select test.rows('until 1 day 12 hours only e3 counts', $$select 1 from public.unanswered_people(7, now() + interval '1 day 12 hours') where last_name = 'Three' and missing = 1$$, 1);
select test.rows('and nobody else', $$select 1 from public.unanswered_people(7, now() + interval '1 day 12 hours')$$, 1);
select test.rows('the time wins over the days', $$select 1 from public.unanswered_people(30, now() + interval '1 day 12 hours')$$, 1);
select test.rows('a time in the past gives nobody', $$select 1 from public.unanswered_people(7, now() - interval '1 day')$$, 0);
select test.rows('a long window reaches the event in 20 days', $$select 1 from public.unanswered_people(7, now() + interval '30 days') where last_name = 'One' and missing = 2$$, 1);
select test.logout();
select test.login('00000000-0000-0000-0000-000000000001');
select test.fails('a player cannot open the list', $$select * from public.unanswered_people(7, now() + interval '1 day')$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot open the list', $$select * from public.unanswered_people(7, now() + interval '1 day')$$, 'permission denied');
select test.logout();
rollback;
\echo ALL UNANSWERED UNTIL TESTS PASSED
