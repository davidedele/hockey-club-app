begin;

-- Same people and events as 04. p1 said present for e1 and f1, p2 said absent for f1.

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

\echo == who said present
create function pg_temp.ev(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
select test.login('00000000-0000-0000-0000-000000000002');
select test.rows('a player sees who said present for an event of their group', $$select * from public.event_present_people(pg_temp.ev('e1')) where last_name = 'One'$$, 1);
select test.rows('an absent answer is not listed', $$select * from public.event_present_people(pg_temp.ev('f1')) where last_name = 'Two'$$, 0);
select test.rows('only present answers are listed', $$select * from public.event_present_people(pg_temp.ev('f1'))$$, 1);
select test.logout();
select test.login('00000000-0000-0000-0000-000000000003');
select test.rows('a player of another group sees nobody', $$select * from public.event_present_people(pg_temp.ev('e1'))$$, 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.rows('staff see who said present for any event', $$select * from public.event_present_people(pg_temp.ev('e1'))$$, 1);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot see who said present', $$select * from public.event_present_people(pg_temp.ev('e1'))$$, 'permission denied');
select test.logout();

rollback;
\echo ALL PRESENT PEOPLE TESTS PASSED
