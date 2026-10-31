begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000003', 'Pip', 'Three'),
  ('00000000-0000-0000-0000-000000000004', 'Pat', 'Four');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'), ('A', '00000000-0000-0000-0000-000000000002'),
    ('A', '00000000-0000-0000-0000-000000000003'), ('C1', '00000000-0000-0000-0000-000000000004')) v(code, uid)
  join public.groups g on g.code = v.code;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.season() returns integer language sql as
  $$ select extract(year from (now() - interval '3 days') at time zone 'Europe/Rome' - interval '8 months')::integer $$;

-- g1 started 3 days ago and ended 5-2; g2 is in two days; g3 started 4 days ago, no score yet; t1 is a training.
insert into public.events (id, type, title, starts_at, ends_at, opponent, home_away, score_for, score_against, cancelled_at) values
  (pg_temp.u('a1'), 'game', 'g1', now() - interval '3 days', now() - interval '3 days' + interval '2 hours', 'X', 'home', 5, 2, null),
  (pg_temp.u('a2'), 'game', 'g2', now() + interval '2 days', now() + interval '2 days 2 hours', 'Y', 'away', null, null, null),
  (pg_temp.u('a3'), 'game', 'g3', now() - interval '4 days', now() - interval '4 days' + interval '2 hours', 'Z', 'home', null, null, null),
  (pg_temp.u('a5'), 'game', 'g5', now() + interval '3 days', now() + interval '3 days 2 hours', 'W', 'home', null, null, now());
insert into public.events (id, type, title, starts_at, ends_at) values
  (pg_temp.u('a4'), 'training', 't1', now() + interval '1 day', now() + interval '1 day 1 hour');
insert into public.event_groups select e.id, g.id from public.events e cross join public.groups g where g.code = 'A';

\echo == points
select test.rows('an exact guess is 13', $$select 1 where public.prediction_points(5, 2, 5, 2) = 13$$, 1);
select test.rows('one goal off on one side is 9 + 3', $$select 1 where public.prediction_points(4, 2, 5, 2) = 12$$, 1);
select test.rows('the wrong winner is only the closeness', $$select 1 where public.prediction_points(1, 2, 5, 2) = 6$$, 1);
select test.rows('a draw guessed for a draw has the bonus', $$select 1 where public.prediction_points(3, 3, 2, 2) = 11$$, 1);
select test.rows('very far is zero, never negative', $$select 1 where public.prediction_points(0, 20, 20, 0) = 0$$, 1);

\echo == making a guess
select test.login(pg_temp.u('1'));
select test.works('a member guesses a game that has not started', $$select public.set_prediction(pg_temp.u('a2'), 3::smallint, 1::smallint)$$);
select test.works('and changes it', $$select public.set_prediction(pg_temp.u('a2'), 4::smallint, 1::smallint)$$);
select test.rows('only one guess is kept', $$select 1 from public.game_predictions where user_id = pg_temp.u('1') and event_id = pg_temp.u('a2') and pred_for = 4$$, 1);
select test.fails('not after the start', $$select public.set_prediction(pg_temp.u('a1'), 3::smallint, 1::smallint)$$, 'prediction_closed');
select test.fails('not for a training', $$select public.set_prediction(pg_temp.u('a4'), 3::smallint, 1::smallint)$$, 'prediction_closed');
select test.fails('not for a cancelled game', $$select public.set_prediction(pg_temp.u('a5'), 3::smallint, 1::smallint)$$, 'prediction_closed');
select test.fails('not an absurd score', $$select public.set_prediction(pg_temp.u('a2'), 31::smallint, 1::smallint)$$, 'prediction_invalid');
select test.fails('not a negative score', $$select public.set_prediction(pg_temp.u('a2'), (-1)::smallint, 1::smallint)$$, 'prediction_invalid');
select test.fails('no direct insert', $$insert into public.game_predictions (event_id, user_id, pred_for, pred_against) values (pg_temp.u('a2'), pg_temp.u('1'), 1, 1)$$, 'permission denied');
select test.fails('no direct update', $$update public.game_predictions set pred_for = 9$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('4'));
select test.fails('someone from another group cannot guess', $$select public.set_prediction(pg_temp.u('a2'), 1::smallint, 1::smallint)$$, 'prediction_closed');
select test.logout();
select test.login(pg_temp.u('9'));
select test.fails('an account without a profile cannot guess', $$select public.set_prediction(pg_temp.u('a2'), 1::smallint, 1::smallint)$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot guess', $$select public.set_prediction(pg_temp.u('a2'), 1::smallint, 1::smallint)$$, 'permission denied');
select test.logout();

\echo == hidden until the start
select test.login(pg_temp.u('2'));
select test.works('p2 guesses g2', $$select public.set_prediction(pg_temp.u('a2'), 0::smallint, 0::smallint)$$);
select test.rows('p2 sees only their own guess before the start', $$select 1 from public.game_predictions where event_id = pg_temp.u('a2')$$, 1);
select test.rows('the list of a game that has not started is empty', $$select 1 from public.game_prediction_list(pg_temp.u('a2'))$$, 0);
select test.logout();
-- The games start: g2 moves to the past (as time passing would do), and the guesses of g1 and g3 are written as if made earlier.
reset role;
insert into public.game_predictions (event_id, user_id, pred_for, pred_against) values
  (pg_temp.u('a1'), pg_temp.u('1'), 5, 2), (pg_temp.u('a1'), pg_temp.u('2'), 3, 3), (pg_temp.u('a1'), pg_temp.u('3'), 1, 0),
  (pg_temp.u('a3'), pg_temp.u('1'), 2, 2);
select test.login(pg_temp.u('3'));
select test.rows('after the start everyone reads the guesses of the game', $$select 1 from public.game_prediction_list(pg_temp.u('a1'))$$, 3);
select test.rows('each guess has its points', $$select 1 from public.game_prediction_list(pg_temp.u('a1')) where points is not null$$, 3);
select test.rows('the best guess is first', $$select 1 from (select user_id, points, row_number() over () n from public.game_prediction_list(pg_temp.u('a1'))) x where n = 1 and user_id = pg_temp.u('1') and points = 13$$, 1);
select test.rows('a game without a final score shows the guesses but no points', $$select 1 from public.game_prediction_list(pg_temp.u('a3')) where points is null$$, 1);
select test.rows('through the table too', $$select 1 from public.game_predictions where event_id = pg_temp.u('a1')$$, 3);
select test.rows('but p3 does not see the guesses of the game that has not started', $$select 1 from public.game_predictions where event_id = pg_temp.u('a2')$$, 0);
select test.logout();

\echo == the season table
select test.login(pg_temp.u('2'));
select test.rows('three people, only finished games counted', $$select 1 from public.prediction_table(pg_temp.season())$$, 3);
select test.rows('p1 leads with 13 points and an exact guess', $$select 1 from (select *, row_number() over () n from public.prediction_table(pg_temp.season())) x where n = 1 and user_id = pg_temp.u('1') and points = 13 and exact = 1 and predictions = 1$$, 1);
select test.logout();
-- A deleted person leaves the table.
select test.login(pg_temp.u('b1'));
select public.delete_member_data(pg_temp.u('3'));
select test.logout();
select test.login(pg_temp.u('2'));
select test.rows('a deleted member is not in the table', $$select 1 from public.prediction_table(pg_temp.season())$$, 2);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read the table', $$select * from public.prediction_table(2026)$$, 'permission denied');
select test.logout();
rollback;
\echo ALL PREDICTION TESTS PASSED
