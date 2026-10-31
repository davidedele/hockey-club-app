begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values ('A', '00000000-0000-0000-0000-000000000001'), ('A', '00000000-0000-0000-0000-000000000002')) v(code, uid)
  join public.groups g on g.code = v.code;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.t(n integer) returns uuid language sql as $$ select ('00000000-0000-0000-0001-' || lpad(n::text, 12, '0'))::uuid $$;

-- Fifteen trainings, one a day from 40 days ago. The fifth is "excused" (breaks a run), p1 was not called
-- to an extra one between the tenth and eleventh. A cancelled training and a game with 30 goals are ignored.
insert into public.events (id, type, title, starts_at, ends_at)
  select pg_temp.t(i), 'training', 'T' || i, now() - make_interval(days => 40 - i), now() - make_interval(days => 40 - i) + interval '1 hour'
  from generate_series(1, 15) i;
insert into public.events (id, type, title, starts_at, ends_at) values
  (pg_temp.t(100), 'training', 'extra', now() - make_interval(days => 30) + interval '12 hours', now() - make_interval(days => 30) + interval '13 hours');
insert into public.events (id, type, title, starts_at, ends_at, cancelled_at) values
  (pg_temp.t(101), 'training', 'cancelled', now() - interval '35 days', now() - interval '35 days' + interval '1 hour', now() - interval '36 days'),
  (pg_temp.t(102), 'game', 'cancelled game', now() - interval '36 days', now() - interval '36 days' + interval '2 hours', now() - interval '37 days');
insert into public.events (id, type, title, starts_at, ends_at, opponent, home_away) values
  (pg_temp.t(201), 'game', 'g1', now() - interval '20 days', now() - interval '20 days' + interval '2 hours', 'X', 'home'),
  (pg_temp.t(202), 'game', 'g2', now() - interval '10 days', now() - interval '10 days' + interval '2 hours', 'Y', 'away');
insert into public.event_groups select e.id, g.id from public.events e cross join public.groups g where g.code = 'A';
insert into public.attendance_records (event_id, user_id, status)
  select pg_temp.t(i), pg_temp.u('1'), case when i = 5 then 'excused'::public.attendance_status else 'on_time'::public.attendance_status end from generate_series(1, 15) i;
insert into public.attendance_records (event_id, user_id, status) values
  (pg_temp.t(100), pg_temp.u('1'), 'not_called_up'),
  (pg_temp.t(101), pg_temp.u('1'), 'on_time'),
  (pg_temp.t(201), pg_temp.u('1'), 'on_time'),
  (pg_temp.t(202), pg_temp.u('1'), 'late');
insert into public.game_stats (event_id, user_id, goals, assists) values
  (pg_temp.t(102), pg_temp.u('1'), 30, 30),
  (pg_temp.t(201), pg_temp.u('1'), 6, 1),
  (pg_temp.t(202), pg_temp.u('1'), 5, 10);

select test.login(pg_temp.u('1'));
select test.rows('seven milestones', $$select 1 from public.my_milestones()$$, 7);
select test.rows('the first goal was in the first game', $$select 1 from public.my_milestones() m where kind = 'goals' and level = 1 and reached_at = (select starts_at from public.events where id = pg_temp.t(201))$$, 1);
select test.rows('ten goals in the second game, not more', $$select 1 from public.my_milestones() m where kind = 'goals' and level = 10 and reached_at = (select starts_at from public.events where id = pg_temp.t(202))$$, 1);
select test.rows('no 25 goals, the cancelled game does not count', $$select 1 from public.my_milestones() where kind = 'goals' and level >= 25$$, 0);
select test.rows('ten assists', $$select 1 from public.my_milestones() where kind = 'assists' and level = 10$$, 1);
select test.rows('the first game, no tenth', $$select 1 from public.my_milestones() where kind = 'games' and level = 1$$, 1);
select test.rows('no ten games', $$select 1 from public.my_milestones() where kind = 'games' and level = 10$$, 0);
select test.rows('the tenth training is the eleventh event (the excused one does not count)', $$select 1 from public.my_milestones() where kind = 'trainings' and level = 10 and reached_at = (select starts_at from public.events where id = pg_temp.t(11))$$, 1);
select test.rows('ten in a row ends at the last training', $$select 1 from public.my_milestones() where kind = 'streak' and level = 10 and reached_at = (select starts_at from public.events where id = pg_temp.t(15))$$, 1);
select test.rows('no twenty in a row', $$select 1 from public.my_milestones() where kind = 'streak' and level = 20$$, 0);
select test.logout();
select test.login(pg_temp.u('2'));
select test.rows('another player gets only their own, which is nothing', $$select 1 from public.my_milestones()$$, 0);
select test.logout();
select test.login(pg_temp.u('9'));
select test.rows('an account without a profile gets nothing', $$select 1 from public.my_milestones()$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot call it', $$select * from public.my_milestones()$$, 'permission denied');
select test.logout();
rollback;
\echo ALL MILESTONE TESTS PASSED
