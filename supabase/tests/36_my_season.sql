begin;

-- People: board1 (board), coach1 (coach), p1, p2, p3 and goalie p5 in A, p4 in C1,
-- and u9, who signed up but never joined with an invite.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.test', now()),
  ('00000000-0000-0000-0000-000000000005', 'p5@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name, position) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board', null),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach', null),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One', 'forward'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two', 'defence'),
  ('00000000-0000-0000-0000-000000000003', 'Pip', 'Three', 'forward'),
  ('00000000-0000-0000-0000-000000000004', 'Pat', 'Four', 'forward'),
  ('00000000-0000-0000-0000-000000000005', 'Gil', 'Five', 'goalie');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('A', '00000000-0000-0000-0000-000000000002'),
    ('A', '00000000-0000-0000-0000-000000000003'),
    ('A', '00000000-0000-0000-0000-000000000005'),
    ('C1', '00000000-0000-0000-0000-000000000004')) v(code, uid)
  join public.groups g on g.code = v.code;

-- g1: a game of A two days ago. g2: a game of A in two days. t1: a training of A two days ago.
insert into public.events (id, type, title, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'game', 'g1', now() - interval '2 days', now() - interval '2 days' + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000a2', 'game', 'g2', now() + interval '2 days', now() + interval '2 days 2 hours'),
  ('00000000-0000-0000-0000-0000000000a3', 'training', 't1', now() - interval '2 days', now() - interval '2 days' + interval '1 hour');
insert into public.event_groups
  select e, g.id from unnest(array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2',
                                   '00000000-0000-0000-0000-0000000000a3']::uuid[]) e
  cross join public.groups g where g.code = 'A';
-- In g1: p1 and p2 said present; p3 said present but was recorded excused; p5 was recorded on time.
insert into public.attendance_answers (event_id, user_id, answer) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'present'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002', 'present'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000003', 'present'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', 'present'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000002', 'present');
insert into public.attendance_records (event_id, user_id, status) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000003', 'excused'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000005', 'on_time');

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.season() returns integer language sql as
  $$ select extract(year from (now() - interval '2 days') at time zone 'Europe/Rome' - interval '8 months')::integer $$;
grant usage on schema test to authenticated;

-- A second game two days ago, so the average rating can tell a game the player voted on from one they did not.
insert into public.events (id, type, title, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000a4', 'game', 'g3', now() - interval '3 days', now() - interval '3 days' + interval '2 hours');
insert into public.event_groups select '00000000-0000-0000-0000-0000000000a4', g.id from public.groups g where g.code = 'A';
insert into public.attendance_records (event_id, user_id, status) values
  (pg_temp.u('a1'), pg_temp.u('1'), 'on_time'), (pg_temp.u('a4'), pg_temp.u('1'), 'late'), (pg_temp.u('a3'), pg_temp.u('1'), 'unexcused'),
  (pg_temp.u('a1'), pg_temp.u('2'), 'on_time'), (pg_temp.u('a4'), pg_temp.u('2'), 'on_time');
insert into public.game_stats (event_id, user_id, goals, assists, penalty_minutes) values
  (pg_temp.u('a1'), pg_temp.u('1'), 2, 1, 4), (pg_temp.u('a4'), pg_temp.u('1'), 1, 0, 0), (pg_temp.u('a1'), pg_temp.u('2'), 0, 3, 2);
-- p2 rates p1 in both games, and p1 voted for the MVP in g1 only.
insert into public.game_ratings (event_id, rater_id, rated_id, rating) values
  (pg_temp.u('a1'), pg_temp.u('2'), pg_temp.u('1'), 8), (pg_temp.u('a4'), pg_temp.u('2'), pg_temp.u('1'), 4);
insert into public.mvp_votes (event_id, voter_id, voted_id) values
  (pg_temp.u('a1'), pg_temp.u('1'), pg_temp.u('2')), (pg_temp.u('a1'), pg_temp.u('2'), pg_temp.u('1'));

\echo == my season
select test.login(pg_temp.u('1'));
select test.rows('a player gets one row', $$select 1 from public.my_season(pg_temp.season())$$, 1);
select test.rows('attendance of the season: events, on time, late, not excused', $$select 1 from public.my_season(pg_temp.season()) where events_total = 3 and on_time = 1 and late = 1 and unexcused = 1 and excused = 0$$, 1);
select test.rows('games, goals, assists and penalty minutes are the ones of the statistics page', $$select 1 from public.my_season(pg_temp.season()) m join public.season_player_stats(pg_temp.season(), null) s on s.user_id = pg_temp.u('1') where m.games = s.games and m.goals = s.goals and m.assists = s.assists and m.penalty_minutes = s.penalty_minutes and m.mvp = s.mvp$$, 1);
select test.rows('the numbers are right', $$select 1 from public.my_season(pg_temp.season()) where goals = 3 and assists = 1 and penalty_minutes = 4 and mvp = 1$$, 1);
select test.rows('the average rating counts only the game the player voted on', $$select 1 from public.my_season(pg_temp.season()) where rating_avg = 8.0 and rated_games = 1$$, 1);
select test.rows('a season with nothing in it gives zeros, not another person''s numbers', $$select 1 from public.my_season(pg_temp.season() - 5) where events_total = 0 and goals = 0 and rating_avg is null$$, 1);
select test.rows('a season out of range gives nothing', $$select 1 from public.my_season(1999)$$, 0);
select test.logout();

select test.login(pg_temp.u('2'));
select test.rows('another player sees their own numbers, not those of the first', $$select 1 from public.my_season(pg_temp.season()) where goals = 0 and assists = 3 and penalty_minutes = 2 and mvp = 1 and on_time = 2$$, 1);
select test.rows('there is no way to ask for somebody else: the function takes no person', $$select 1 from pg_proc where proname = 'my_season' and pronargs = 1$$, 1);
select test.logout();

select test.login(pg_temp.u('c1'));
select test.rows('a coach in no group gets zeros, not the numbers of any player', $$select 1 from public.my_season(pg_temp.season()) where events_total = 0 and goals = 0 and games = 0$$, 1);
select test.logout();
select test.login(pg_temp.u('9'));
select test.rows('an account without a profile gets nothing', $$select 1 from public.my_season(pg_temp.season())$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot call it', $$select * from public.my_season(2026)$$, 'permission denied');
select test.logout();
rollback;
\echo ALL MY SEASON TESTS PASSED
