begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.test', now()),
  ('00000000-0000-0000-0000-000000000005', 'p5@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000003', 'Pip', 'Three'),
  ('00000000-0000-0000-0000-000000000004', 'Pat', 'Four'),
  ('00000000-0000-0000-0000-000000000005', 'Pam', 'Five');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'), ('A', '00000000-0000-0000-0000-000000000002'),
    ('A', '00000000-0000-0000-0000-000000000003'), ('A', '00000000-0000-0000-0000-000000000004'),
    ('C1', '00000000-0000-0000-0000-000000000005')) v(code, uid)
  join public.groups g on g.code = v.code;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.day(n integer) returns date language sql as $$ select ((now() at time zone 'Europe/Rome')::date + n) $$;
create function pg_temp.season() returns integer language sql as
  $$ select extract(year from (now() - interval '3 days') at time zone 'Europe/Rome' - interval '8 months')::integer $$;

-- Round R1: two games three days ago (both over). Round R2: one game in two days. Round R3: a game today that started
-- an hour ago and is still going. Round R4: one game in five days, cancelled. R5: a training in three days.
insert into public.events (id, type, title, starts_at, ends_at, opponent, home_away, score_for, score_against, cancelled_at) values
  (pg_temp.u('a1'), 'game', 'r1a', now() - interval '3 days 5 hours', now() - interval '3 days 3 hours', 'X', 'home', 5, 2, null),
  (pg_temp.u('a2'), 'game', 'r1b', now() - interval '3 days 2 hours', now() - interval '3 days', 'Y', 'home', 1, 2, null),
  (pg_temp.u('a3'), 'game', 'r2', now() + interval '2 days', now() + interval '2 days 2 hours', 'Z', 'away', null, null, null),
  (pg_temp.u('a4'), 'game', 'r3', now() - interval '1 hour', now() + interval '1 hour', 'W', 'home', null, null, null),
  (pg_temp.u('a5'), 'game', 'r4', now() + interval '5 days', now() + interval '5 days 2 hours', 'V', 'home', null, null, now());
insert into public.events (id, type, title, starts_at, ends_at) values
  (pg_temp.u('a6'), 'training', 't', now() + interval '3 days', now() + interval '3 days 1 hour');
insert into public.event_groups select e.id, g.id from public.events e cross join public.groups g where g.code = 'A';
-- R1 numbers: p1 scored 2 and assisted 1 in game a; p2 assisted 2 in game a and scored 1 in game b.
insert into public.game_stats (event_id, user_id, goals, assists) values
  (pg_temp.u('a1'), pg_temp.u('1'), 2, 1), (pg_temp.u('a1'), pg_temp.u('2'), 0, 2), (pg_temp.u('a2'), pg_temp.u('2'), 1, 0);
-- MVP of game a: p1 with two votes against one for p2. Game b: a tie, p2 and p3 one vote each.
insert into public.mvp_votes (event_id, voter_id, voted_id) values
  (pg_temp.u('a1'), pg_temp.u('2'), pg_temp.u('1')), (pg_temp.u('a1'), pg_temp.u('3'), pg_temp.u('1')), (pg_temp.u('a1'), pg_temp.u('4'), pg_temp.u('2')),
  (pg_temp.u('a2'), pg_temp.u('1'), pg_temp.u('2')), (pg_temp.u('a2'), pg_temp.u('4'), pg_temp.u('3'));
-- Ratings in game a: p1 gets 9 and 8 (average 8.5, rounds to 9, minus 5 is 4); p3 gets 4 (below 5, so 0).
insert into public.game_ratings (event_id, rater_id, rated_id, rating) values
  (pg_temp.u('a1'), pg_temp.u('2'), pg_temp.u('1'), 9), (pg_temp.u('a1'), pg_temp.u('3'), pg_temp.u('1'), 8), (pg_temp.u('a1'), pg_temp.u('1'), pg_temp.u('3'), 4);

\echo == who can be picked
select test.login(pg_temp.u('1'));
select test.rows('five people in a group can be picked', $$select 1 from public.fanta_candidates()$$, 5);
select test.rows('the board has no group and is not a candidate', $$select 1 from public.fanta_candidates() where user_id = pg_temp.u('b1')$$, 0);
select test.rows('the next round is the game in two days', $$select 1 from public.fanta_next_round() where round_day = pg_temp.day(2) and games = 1$$, 1);
select test.logout();

select test.login(pg_temp.u('1'));
select test.rows('the last round is the one in progress, not over', $$select 1 from public.fanta_last_round() where round_day = pg_temp.day(0) and over = false and games = 1$$, 1);
select test.logout();
select test.login_anon();
select test.fails('anonymous has no rounds', $$select * from public.fanta_last_round()$$, 'permission denied');
select test.logout();

\echo == picking
select test.login(pg_temp.u('1'));
select test.works('three picks for the next round', $$select public.set_fanta_picks(pg_temp.day(2), array[pg_temp.u('1'), pg_temp.u('2'), pg_temp.u('3')])$$);
select test.works('and a change replaces them', $$select public.set_fanta_picks(pg_temp.day(2), array[pg_temp.u('2'), pg_temp.u('3'), pg_temp.u('4')])$$);
select test.rows('three picks are kept, not six', $$select 1 from public.fanta_picks where user_id = pg_temp.u('1') and round_day = pg_temp.day(2)$$, 3);
select test.rows('the new ones', $$select 1 from public.fanta_picks where user_id = pg_temp.u('1') and player_id = pg_temp.u('1')$$, 0);
select test.fails('two picks are not enough', $$select public.set_fanta_picks(pg_temp.day(2), array[pg_temp.u('2'), pg_temp.u('3')])$$, 'fanta_invalid');
select test.fails('four are too many', $$select public.set_fanta_picks(pg_temp.day(2), array[pg_temp.u('1'), pg_temp.u('2'), pg_temp.u('3'), pg_temp.u('4')])$$, 'fanta_invalid');
select test.fails('the same player twice is refused', $$select public.set_fanta_picks(pg_temp.day(2), array[pg_temp.u('2'), pg_temp.u('2'), pg_temp.u('3')])$$, 'fanta_invalid');
select test.fails('a null is refused', $$select public.set_fanta_picks(pg_temp.day(2), array[pg_temp.u('2'), null, pg_temp.u('3')]::uuid[])$$, 'fanta_invalid');
select test.fails('a person with no group is refused', $$select public.set_fanta_picks(pg_temp.day(2), array[pg_temp.u('1'), pg_temp.u('2'), pg_temp.u('b1')])$$, 'fanta_invalid');
select test.fails('a person that does not exist is refused', $$select public.set_fanta_picks(pg_temp.day(2), array[pg_temp.u('1'), pg_temp.u('2'), pg_temp.u('77')])$$, 'fanta_invalid');
select test.fails('not after the round started', $$select public.set_fanta_picks(pg_temp.day(0), array[pg_temp.u('1'), pg_temp.u('2'), pg_temp.u('3')])$$, 'fanta_closed');
select test.fails('not for a round long over', $$select public.set_fanta_picks(pg_temp.day(-3), array[pg_temp.u('1'), pg_temp.u('2'), pg_temp.u('3')])$$, 'fanta_closed');
select test.fails('not for a day with only a cancelled game', $$select public.set_fanta_picks(pg_temp.day(5), array[pg_temp.u('1'), pg_temp.u('2'), pg_temp.u('3')])$$, 'fanta_closed');
select test.fails('not for a day with only a training', $$select public.set_fanta_picks(pg_temp.day(3), array[pg_temp.u('1'), pg_temp.u('2'), pg_temp.u('3')])$$, 'fanta_closed');
select test.fails('not for a day with no game', $$select public.set_fanta_picks(pg_temp.day(9), array[pg_temp.u('1'), pg_temp.u('2'), pg_temp.u('3')])$$, 'fanta_closed');
select test.fails('a failed change keeps the old picks', $$select public.set_fanta_picks(pg_temp.day(2), array[pg_temp.u('1')])$$, 'fanta_invalid');
select test.rows('still the three of before', $$select 1 from public.fanta_picks where user_id = pg_temp.u('1') and round_day = pg_temp.day(2)$$, 3);
select test.fails('no direct insert', $$insert into public.fanta_picks (round_day, user_id, player_id) values (pg_temp.day(2), pg_temp.u('1'), pg_temp.u('1'))$$, 'permission denied');
select test.fails('no direct delete', $$delete from public.fanta_picks$$, 'permission denied');
select test.fails('no direct update', $$update public.fanta_picks set player_id = pg_temp.u('1')$$, 'permission denied');
select test.logout();

\echo == hidden until the round starts
select test.login(pg_temp.u('2'));
select test.works('p2 picks too', $$select public.set_fanta_picks(pg_temp.day(2), array[pg_temp.u('1'), pg_temp.u('2'), pg_temp.u('3')])$$);
select test.rows('p2 sees only the own three', $$select 1 from public.fanta_picks where round_day = pg_temp.day(2)$$, 3);
select test.rows('and the list says nothing before the start', $$select 1 from public.fanta_round_list(pg_temp.day(2))$$, 0);
select test.logout();
select test.login(pg_temp.u('b1'));
select test.rows('not even the board reads the picks before the start', $$select 1 from public.fanta_picks where round_day = pg_temp.day(2)$$, 0);
select test.logout();

\echo == after the start
reset role;
insert into public.fanta_picks (round_day, user_id, player_id) values
  (pg_temp.day(-3), pg_temp.u('1'), pg_temp.u('1')), (pg_temp.day(-3), pg_temp.u('1'), pg_temp.u('3')), (pg_temp.day(-3), pg_temp.u('1'), pg_temp.u('4')),
  (pg_temp.day(-3), pg_temp.u('2'), pg_temp.u('2')), (pg_temp.day(-3), pg_temp.u('2'), pg_temp.u('3')), (pg_temp.day(-3), pg_temp.u('2'), pg_temp.u('4')),
  (pg_temp.day(0), pg_temp.u('3'), pg_temp.u('1')), (pg_temp.day(0), pg_temp.u('3'), pg_temp.u('2')), (pg_temp.day(0), pg_temp.u('3'), pg_temp.u('3'));
select test.login(pg_temp.u('4'));
select test.rows('a member who did not play reads the picks of a started round', $$select 1 from public.fanta_picks where round_day = pg_temp.day(-3)$$, 6);
select test.rows('and of the round in progress', $$select 1 from public.fanta_picks where round_day = pg_temp.day(0)$$, 3);
select test.rows('the list has a row per pick', $$select 1 from public.fanta_round_list(pg_temp.day(-3))$$, 6);
-- Points: p1 has 2 goals (6) + 1 assist (2) + MVP of game a (5) + rating 8.5 rounded 9 minus 5 (4) = 17.
-- p2 has 2 assists (4) + 1 goal (3) + MVP of game b by a tie (5) = 12. p3 has the tied MVP (5) and a rating of 4 (0) = 5. p4 has none.
select test.rows('p1 has 17 points', $$select 1 from public.fanta_round_list(pg_temp.day(-3)) where user_id = pg_temp.u('1') and points = 17 and player_id = pg_temp.u('1')$$, 1);
select test.rows('p2 has 12 points', $$select 1 from public.fanta_round_list(pg_temp.day(-3)) where user_id = pg_temp.u('2') and points = 12 and player_id = pg_temp.u('2')$$, 1);
select test.rows('p3 has 5 points, a tie is an MVP for each and a low rating is 0', $$select 1 from public.fanta_round_list(pg_temp.day(-3)) where user_id = pg_temp.u('1') and points = 5 and player_id = pg_temp.u('3')$$, 1);
select test.rows('p4 has none', $$select 1 from public.fanta_round_list(pg_temp.day(-3)) where user_id = pg_temp.u('1') and points = 0 and player_id = pg_temp.u('4')$$, 1);
select test.rows('p1 picked p1 (17), p3 (5), p4 (0)', $$select 1 from public.fanta_round_list(pg_temp.day(-3)) where user_id = pg_temp.u('1') and points = 17 and player_id = pg_temp.u('1')$$, 1);
select test.rows('the picks of a round in progress are listed too', $$select 1 from public.fanta_round_list(pg_temp.day(0))$$, 3);
select test.rows('the round in the future stays hidden', $$select 1 from public.fanta_picks where round_day = pg_temp.day(2)$$, 0);
select test.logout();

\echo == the season table
select test.login(pg_temp.u('4'));
select test.rows('two people in the table, only the round that is over', $$select 1 from public.fanta_table(pg_temp.season())$$, 2);
select test.rows('p1: 17 + 5 + 0 = 22 in one round, first', $$select 1 from (select *, row_number() over () n from public.fanta_table(pg_temp.season())) x where n = 1 and user_id = pg_temp.u('1') and points = 22 and rounds = 1$$, 1);
select test.rows('p2: 12 + 5 + 0 = 17', $$select 1 from public.fanta_table(pg_temp.season()) where user_id = pg_temp.u('2') and points = 17$$, 1);
select test.rows('p3 picked in a round still going, so is not in the table', $$select 1 from public.fanta_table(pg_temp.season()) where user_id = pg_temp.u('3')$$, 0);
select test.rows('another season is empty', $$select 1 from public.fanta_table(pg_temp.season() - 3)$$, 0);
select test.logout();
-- A deleted person leaves the table.
select test.login(pg_temp.u('b1'));
select public.delete_member_data(pg_temp.u('2'));
select test.logout();
select test.login(pg_temp.u('4'));
select test.rows('a deleted member is not in the table', $$select 1 from public.fanta_table(pg_temp.season()) where user_id = pg_temp.u('2')$$, 0);
select test.rows('and cannot be picked any more', $$select 1 from public.fanta_candidates() where user_id = pg_temp.u('2')$$, 0);
select test.logout();

\echo == outsiders
select test.login(pg_temp.u('9'));
select test.rows('a person with no profile reads no picks', $$select 1 from public.fanta_picks$$, 0);
select test.rows('has no candidates', $$select 1 from public.fanta_candidates()$$, 0);
select test.rows('has no table', $$select 1 from public.fanta_table(pg_temp.season())$$, 0);
select test.fails('cannot pick', $$select public.set_fanta_picks(pg_temp.day(2), array[pg_temp.u('1'), pg_temp.u('3'), pg_temp.u('4')])$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read picks', $$select * from public.fanta_picks$$, 'permission denied');
select test.fails('anonymous cannot read the table', $$select * from public.fanta_table(2026)$$, 'permission denied');
select test.fails('anonymous cannot pick', $$select public.set_fanta_picks(pg_temp.day(2), array[pg_temp.u('1'), pg_temp.u('3'), pg_temp.u('4')])$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('1'));
select test.fails('the points function is for the server only', $$select * from public.fanta_player_points(pg_temp.day(-3))$$, 'permission denied');
select test.logout();
rollback;
\echo ALL FANTAHOCKEY TESTS PASSED
