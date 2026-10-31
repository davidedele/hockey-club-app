begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000003', 'Pip', 'Three');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board');
insert into public.group_members (group_id, user_id)
  select g.id, u::uuid from public.groups g, unnest(array['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003']) u where g.code = 'A';
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.season() returns integer language sql as
  $$ select extract(year from (now() - interval '10 days') at time zone 'Europe/Rome' - interval '8 months')::integer $$;

-- Two games and two trainings 10 days ago or more. p1 and p2 each have 3 goals; p3 has the most assists.
insert into public.events (id, type, title, starts_at, ends_at, opponent, home_away) values
  (pg_temp.u('a1'), 'game', 'g1', now() - interval '10 days', now() - interval '10 days' + interval '2 hours', 'X', 'home'),
  (pg_temp.u('a2'), 'game', 'g2', now() - interval '12 days', now() - interval '12 days' + interval '2 hours', 'Y', 'away');
insert into public.events (id, type, title, starts_at, ends_at) values
  (pg_temp.u('a3'), 'training', 't1', now() - interval '11 days', now() - interval '11 days' + interval '1 hour'),
  (pg_temp.u('a4'), 'training', 't2', now() - interval '13 days', now() - interval '13 days' + interval '1 hour');
insert into public.event_groups select e.id, g.id from public.events e cross join public.groups g where g.code = 'A';
insert into public.game_stats (event_id, user_id, goals, assists) values
  (pg_temp.u('a1'), pg_temp.u('1'), 2, 0), (pg_temp.u('a2'), pg_temp.u('1'), 1, 0),
  (pg_temp.u('a1'), pg_temp.u('2'), 3, 0),
  (pg_temp.u('a1'), pg_temp.u('3'), 0, 4);
insert into public.attendance_records (event_id, user_id, status) values
  (pg_temp.u('a1'), pg_temp.u('1'), 'on_time'), (pg_temp.u('a2'), pg_temp.u('1'), 'on_time'), (pg_temp.u('a3'), pg_temp.u('1'), 'late'), (pg_temp.u('a4'), pg_temp.u('1'), 'excused'),
  (pg_temp.u('a1'), pg_temp.u('2'), 'on_time'), (pg_temp.u('a2'), pg_temp.u('2'), 'on_time'),
  (pg_temp.u('a1'), pg_temp.u('3'), 'on_time');

select test.login(pg_temp.u('3'));
select test.rows('the two scorers tie on goals', $$select 1 from public.season_leaders(pg_temp.season()) where category = 'goals' and value = 3$$, 2);
select test.rows('p3 leads the assists alone', $$select 1 from public.season_leaders(pg_temp.season()) where category = 'assists' and user_id = pg_temp.u('3') and value = 4$$, 1);
select test.rows('p3 leads the points alone', $$select 1 from public.season_leaders(pg_temp.season()) where category = 'points' and value = 4$$, 1);
select test.rows('nobody has an MVP, so the category is left out', $$select 1 from public.season_leaders(pg_temp.season()) where category = 'mvp'$$, 0);
select test.rows('p1 is the most present: 3 events (the excused one does not count)', $$select 1 from public.season_leaders(pg_temp.season()) where category = 'present' and user_id = pg_temp.u('1') and value = 3$$, 1);
select test.rows('another season is empty', $$select 1 from public.season_leaders(pg_temp.season() - 5)$$, 0);
select test.logout();
select test.login(pg_temp.u('b1'));
select public.delete_member_data(pg_temp.u('2'));
select test.rows('a deleted member is left out', $$select 1 from public.season_leaders(pg_temp.season()) where user_id = pg_temp.u('2')$$, 0);
select test.rows('and the goals leader is now p1', $$select 1 from public.season_leaders(pg_temp.season()) where category = 'goals' and user_id = pg_temp.u('1') and value = 3$$, 1);
select test.logout();
select test.login(pg_temp.u('9'));
select test.rows('an account without a profile reads nothing', $$select 1 from public.season_leaders(pg_temp.season())$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot call it', $$select * from public.season_leaders(2026)$$, 'permission denied');
select test.logout();
rollback;
\echo ALL SEASON LEADER TESTS PASSED
