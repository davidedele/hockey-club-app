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

\echo == game numbers
select test.login(pg_temp.u('1'));
select test.fails('a player cannot enter game numbers', $$select public.save_game_stats(pg_temp.u('a1'), '[]')$$, 'forbidden');
select test.fails('a player cannot write game numbers directly', $$insert into public.game_stats (event_id, user_id) values (pg_temp.u('a1'), pg_temp.u('1'))$$, 'permission denied');
select test.fails('nobody sees who played', $$select public.took_part(pg_temp.u('a1'), pg_temp.u('3'))$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.works('a coach enters the numbers of a game', $$select public.save_game_stats(pg_temp.u('a1'), '[
  {"user_id": "00000000-0000-0000-0000-000000000001", "goals": 2, "assists": 1},
  {"user_id": "00000000-0000-0000-0000-000000000002", "assists": 1, "penalty_minutes": 2},
  {"user_id": "00000000-0000-0000-0000-000000000005", "shots_against": 30, "saves": 27}]')$$);
select test.rows('the numbers are stored', $$select * from public.game_stats where event_id = pg_temp.u('a1')$$, 3);
select test.fails('numbers only for people who played', $$select public.save_game_stats(pg_temp.u('a1'), '[
  {"user_id": "00000000-0000-0000-0000-000000000003", "goals": 1}]')$$, 'not_in_game');
select test.rows('a refused save keeps the old numbers', $$select * from public.game_stats where event_id = pg_temp.u('a1')$$, 3);
select test.fails('saves cannot exceed shots against', $$select public.save_game_stats(pg_temp.u('a1'), '[
  {"user_id": "00000000-0000-0000-0000-000000000005", "shots_against": 10, "saves": 11}]')$$, 'check constraint');
select test.fails('a training has no game numbers', $$select public.save_game_stats(pg_temp.u('a3'), '[]')$$, 'not_a_game');
select test.fails('the numbers must be a list', $$select public.save_game_stats(pg_temp.u('a1'), '{}')$$, 'stats_invalid');
select test.fails('a coach cannot change numbers directly', $$update public.game_stats set goals = 9$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('4'));
select test.rows('the whole club sees the game numbers', $$select * from public.game_stats$$, 3);
select test.logout();
select test.login(pg_temp.u('9'));
select test.rows('someone without a profile sees no game numbers', $$select * from public.game_stats$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read game numbers', $$select * from public.game_stats$$, 'permission denied');
select test.logout();

\echo == ratings and MVP
select test.login(pg_temp.u('3'));
select test.fails('someone who did not play cannot vote', $$select public.submit_game_vote(pg_temp.u('a1'), pg_temp.u('1'), '[]')$$, 'forbidden');
select test.logout();
select test.login(pg_temp.u('4'));
select test.fails('a player of another group cannot vote', $$select public.submit_game_vote(pg_temp.u('a1'), pg_temp.u('1'), '[]')$$, 'forbidden');
select test.logout();
select test.login(pg_temp.u('9'));
select test.fails('someone without a profile cannot vote', $$select public.submit_game_vote(pg_temp.u('a1'), pg_temp.u('1'), '[]')$$, 'forbidden');
select test.logout();
select test.login(pg_temp.u('1'));
select test.fails('voting waits for the end of the game', $$select public.submit_game_vote(pg_temp.u('a2'), pg_temp.u('2'), '[]')$$, 'game_not_over');
select test.fails('nobody is their own MVP', $$select public.submit_game_vote(pg_temp.u('a1'), pg_temp.u('1'), '[]')$$, 'mvp_invalid');
select test.fails('the MVP must have played', $$select public.submit_game_vote(pg_temp.u('a1'), pg_temp.u('3'), '[]')$$, 'mvp_invalid');
select test.fails('the MVP is required', $$select public.submit_game_vote(pg_temp.u('a1'), null, '[]')$$, 'mvp_invalid');
select test.fails('nobody rates themself', $$select public.submit_game_vote(pg_temp.u('a1'), pg_temp.u('2'),
  '[{"user_id": "00000000-0000-0000-0000-000000000001", "rating": 9}]')$$, 'rating_invalid');
select test.fails('only people who played are rated', $$select public.submit_game_vote(pg_temp.u('a1'), pg_temp.u('2'),
  '[{"user_id": "00000000-0000-0000-0000-000000000003", "rating": 6}]')$$, 'rating_invalid');
select test.fails('ratings go from 1 to 10', $$select public.submit_game_vote(pg_temp.u('a1'), pg_temp.u('2'),
  '[{"user_id": "00000000-0000-0000-0000-000000000005", "rating": 11}]')$$, 'rating_invalid');
select test.fails('a player cannot write a rating directly', $$insert into public.game_ratings values (pg_temp.u('a1'), pg_temp.u('1'), pg_temp.u('2'), 10)$$, 'permission denied');
select test.fails('a player cannot write a vote directly', $$insert into public.mvp_votes (event_id, voter_id, voted_id) values (pg_temp.u('a1'), pg_temp.u('1'), pg_temp.u('2'))$$, 'permission denied');
select test.logout();

select test.login(pg_temp.u('2'));
select test.works('a player who played votes', $$select public.submit_game_vote(pg_temp.u('a1'), pg_temp.u('1'),
  '[{"user_id": "00000000-0000-0000-0000-000000000001", "rating": 8}, {"user_id": "00000000-0000-0000-0000-000000000005", "rating": 6}]')$$);
select test.logout();

select test.login(pg_temp.u('1'));
select test.rows('a player who played sees everyone who played', $$select * from public.game_results(pg_temp.u('a1')) where played$$, 3);
select test.rows('a player sees the numbers before voting', $$select * from public.game_results(pg_temp.u('a1')) where goals = 2$$, 1);
select test.rows('ratings stay hidden until the player votes', $$select * from public.game_results(pg_temp.u('a1')) where rating_avg is not null or mvp_votes is not null$$, 0);
select test.works('the player votes', $$select public.submit_game_vote(pg_temp.u('a1'), pg_temp.u('2'),
  '[{"user_id": "00000000-0000-0000-0000-000000000002", "rating": 7}, {"user_id": "00000000-0000-0000-0000-000000000005", "rating": 9}]')$$);
select test.fails('a vote is final', $$select public.submit_game_vote(pg_temp.u('a1'), pg_temp.u('5'), '[]')$$, 'already_voted');
select test.rows('after voting the ratings show', $$select * from public.game_results(pg_temp.u('a1')) where user_id = pg_temp.u('1') and rating_avg = 8 and rating_count = 1 and mvp_votes = 1$$, 1);
select test.rows('the average of two ratings', $$select * from public.game_results(pg_temp.u('a1')) where user_id = pg_temp.u('5') and rating_avg = 7.5$$, 1);
select test.rows('a player sees their own rating of a teammate', $$select * from public.game_results(pg_temp.u('a1')) where user_id = pg_temp.u('2') and my_rating = 7$$, 1);
select test.rows('a player reads only the ratings they gave', $$select * from public.game_ratings$$, 2);
select test.rows('a player reads only their own vote', $$select * from public.mvp_votes$$, 1);
select test.fails('a vote cannot be taken back', $$delete from public.mvp_votes$$, 'permission denied');
select test.logout();

select test.login(pg_temp.u('3'));
select test.rows('a member who did not play sees the ratings', $$select * from public.game_results(pg_temp.u('a1')) where rating_avg is not null$$, 3);
select test.rows('nobody reads the ratings others gave', $$select * from public.game_ratings$$, 0);
select test.logout();
select test.login(pg_temp.u('4'));
select test.rows('a player of another group does not see the game', $$select * from public.game_results(pg_temp.u('a1'))$$, 0);
select test.logout();
select test.login(pg_temp.u('b1'));
select test.rows('staff see the ratings', $$select * from public.game_results(pg_temp.u('a1')) where rating_avg is not null$$, 3);
select test.rows('the board cannot see who rated whom', $$select * from public.game_ratings$$, 0);
select test.rows('the board cannot see who voted for whom', $$select * from public.mvp_votes$$, 0);
select test.logout();
select test.login(pg_temp.u('9'));
select test.rows('someone without a profile sees no game', $$select * from public.game_results(pg_temp.u('a1'))$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot see a game', $$select * from public.game_results(pg_temp.u('a1'))$$, 'permission denied');
select test.fails('anonymous cannot vote', $$select public.submit_game_vote(pg_temp.u('a1'), pg_temp.u('1'), '[]')$$, 'permission denied');
select test.logout();

\echo == season statistics
select test.login(pg_temp.u('c1'));
select test.affected('the coach sets the score', $$update public.events set score_for = 4, score_against = 2 where id = pg_temp.u('a1')$$, 1);
select test.logout();
select test.login(pg_temp.u('4'));
select test.rows('the whole club sees the season table', $$select * from public.season_player_stats(pg_temp.season())$$, 3);
select test.rows('goals, assists and points add up', $$select * from public.season_player_stats(pg_temp.season()) where user_id = pg_temp.u('1') and games = 1 and goals = 2 and assists = 1 and points = 3$$, 1);
select test.rows('goalie numbers add up', $$select * from public.season_player_stats(pg_temp.season()) where user_id = pg_temp.u('5') and shots_against = 30 and saves = 27$$, 1);
select test.rows('a tie for MVP counts for both', $$select * from public.season_player_stats(pg_temp.season()) where mvp = 1$$, 2);
select test.rows('the season average rating', $$select * from public.season_player_stats(pg_temp.season()) where user_id = pg_temp.u('5') and rating_avg = 7.5$$, 1);
select test.rows('someone who did not play is not listed', $$select * from public.season_player_stats(pg_temp.season()) where user_id = pg_temp.u('3')$$, 0);
select test.rows('a group with no games has an empty table', $$select * from public.season_player_stats(pg_temp.season(), (select id from public.groups where code = 'C1'))$$, 0);
select test.rows('another season is empty', $$select * from public.season_player_stats(pg_temp.season() - 1)$$, 0);
select test.rows('the season record counts the win', $$select * from public.season_record(pg_temp.season()) where games = 1 and wins = 1 and draws = 0 and losses = 0 and goals_for = 4 and goals_against = 2$$, 1);
select test.rows('the record of a group with no games', $$select * from public.season_record(pg_temp.season(), (select id from public.groups where code = 'C1')) where games = 0$$, 1);
select test.logout();
select test.login(pg_temp.u('9'));
select test.rows('someone without a profile sees no season table', $$select * from public.season_player_stats(pg_temp.season())$$, 0);
select test.rows('someone without a profile sees no record', $$select * from public.season_record(pg_temp.season()) where games > 0$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot see the season table', $$select * from public.season_player_stats(pg_temp.season())$$, 'permission denied');
select test.fails('anonymous cannot see the record', $$select * from public.season_record(pg_temp.season())$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.affected('deleting a game removes its numbers and votes', $$delete from public.events where id = pg_temp.u('a1')$$, 1);
select test.logout();
select test.rows('nothing is left behind', $$select 1 from public.game_stats union all select 1 from public.game_ratings union all select 1 from public.mvp_votes$$, 0);

rollback;
\echo ALL GAME STATS TESTS PASSED
