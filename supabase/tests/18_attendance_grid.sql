begin;

-- People: coach1 (coach), board1 (board), p1 and p2 in A, p3 in B, p4 in A and B.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000003', 'Pau', 'Three'),
  ('00000000-0000-0000-0000-000000000004', 'Pit', 'Four');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('A', '00000000-0000-0000-0000-000000000002'),
    ('B', '00000000-0000-0000-0000-000000000003'),
    ('A', '00000000-0000-0000-0000-000000000004'),
    ('B', '00000000-0000-0000-0000-000000000004')) v(code, uid)
  join public.groups g on g.code = v.code;

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.mk(p_id text, p_group text, p_days integer) returns void
language plpgsql as $$
begin
  insert into public.events (id, type, title, starts_at, ends_at)
    values (pg_temp.u(p_id), 'training', p_id, now() + make_interval(days => p_days),
            now() + make_interval(days => p_days) + interval '1 hour');
  insert into public.event_groups select pg_temp.u(p_id), id from public.groups where code = p_group;
end $$;
select pg_temp.mk('e1', 'A', -10);
select pg_temp.mk('e2', 'A', -3);
select pg_temp.mk('e3', 'B', -3);
select pg_temp.mk('e4', 'A', 200);
select pg_temp.mk('e5', 'A', 5);
update public.events set cancelled_at = now() where id = pg_temp.u('e5');
insert into public.attendance_answers (event_id, user_id, answer) values
  (pg_temp.u('e1'), pg_temp.u('1'), 'present'),
  (pg_temp.u('e1'), pg_temp.u('2'), 'absent'),
  (pg_temp.u('e3'), pg_temp.u('3'), 'present');
insert into public.attendance_records (event_id, user_id, status) values
  (pg_temp.u('e1'), pg_temp.u('1'), 'late'),
  (pg_temp.u('e3'), pg_temp.u('3'), 'on_time');

create temp table g as select id from public.groups where code = 'A';
create temp table gb as select id from public.groups where code = 'B';
grant select on g, gb to authenticated;

\echo == who can read it
select test.login(pg_temp.u('1'));
select test.fails('a player cannot read the grid', $$select * from public.attendance_grid((select id from g), now() - interval '30 days', now() + interval '30 days')$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read the grid', $$select * from public.attendance_grid(1::smallint, now() - interval '30 days', now())$$, 'permission denied');
select test.logout();

\echo == what it shows
select test.login(pg_temp.u('c1'));
select test.rows('a coach reads the grid of A: three members by three events', $$select 1 from public.attendance_grid((select id from g), now() - interval '30 days', now() + interval '30 days')$$, 9);
select test.rows('the events of A are the ones in the grid', $$select 1 from public.attendance_grid((select id from g), now() - interval '30 days', now() + interval '30 days') where title in ('e1', 'e2', 'e5')$$, 9);
select test.rows('an event of B is not in the grid of A', $$select 1 from public.attendance_grid((select id from g), now() - interval '30 days', now() + interval '30 days') where title = 'e3'$$, 0);
select test.rows('a member of B only is not in the grid of A', $$select 1 from public.attendance_grid((select id from g), now() - interval '30 days', now() + interval '30 days') where user_id = pg_temp.u('3')$$, 0);
select test.rows('a member of A and B is in both grids', $$select 1 from public.attendance_grid((select id from gb), now() - interval '30 days', now() + interval '30 days') where user_id = pg_temp.u('4')$$, 1);
select test.rows('the answer and the recorded status are returned', $$select 1 from public.attendance_grid((select id from g), now() - interval '30 days', now() + interval '30 days') where title = 'e1' and user_id = pg_temp.u('1') and answer = 'present' and status = 'late'$$, 1);
select test.rows('an answer without a record has no status', $$select 1 from public.attendance_grid((select id from g), now() - interval '30 days', now() + interval '30 days') where title = 'e1' and user_id = pg_temp.u('2') and answer = 'absent' and status is null$$, 1);
select test.rows('no answer gives empty cells', $$select 1 from public.attendance_grid((select id from g), now() - interval '30 days', now() + interval '30 days') where title = 'e2' and answer is null and status is null$$, 3);
select test.rows('a cancelled event is marked cancelled', $$select 1 from public.attendance_grid((select id from g), now() - interval '30 days', now() + interval '30 days') where title = 'e5' and cancelled$$, 3);
select test.rows('an event outside the period is left out', $$select 1 from public.attendance_grid((select id from g), now() - interval '30 days', now() + interval '30 days') where title = 'e4'$$, 0);
select test.rows('a shorter period shows only what falls in it', $$select 1 from public.attendance_grid((select id from g), now() - interval '5 days', now() + interval '30 days')$$, 6);
select test.logout();
select test.login(pg_temp.u('b1'));
select test.rows('the board reads it too', $$select 1 from public.attendance_grid((select id from g), now() - interval '30 days', now() + interval '30 days')$$, 9);

\echo == the period
select test.fails('a period longer than about three months is refused', $$select * from public.attendance_grid((select id from g), now() - interval '100 days', now())$$, 'range_invalid');
select test.fails('an empty period is refused', $$select * from public.attendance_grid((select id from g), now(), now())$$, 'range_invalid');
select test.fails('a missing date is refused', $$select * from public.attendance_grid((select id from g), null, now())$$, 'range_invalid');
select test.logout();
