begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000003', 'Pip', 'Three');
insert into public.profile_contacts (user_id, email, phone)
  select p.id, u.email, '3331112222' from public.profiles p join auth.users u using (id);
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('C1', '00000000-0000-0000-0000-000000000003')) v(code, uid)
  join public.groups g on g.code = v.code;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
grant usage on schema test to authenticated;
update public.groups set league_team = 'HC SGULARAT' where code = 'A';
update public.groups set league_team = 'HC SGULARAT C1' where code = 'C1';

-- a0: A game in two days against Fanano. c1: a C1 game 10 days ago against Fanano, 5-1, with a guess of p3.
-- a1: an A game 12 days ago against Fanano, 4-2. League: Fanano against the C1 team, and against the A team.
insert into public.events (id, type, title, starts_at, ends_at, opponent, home_away, score_for, score_against) values
  (pg_temp.u('a0'), 'game', 'a0', now() + interval '2 days', now() + interval '2 days 2 hours', 'HC Fanano', 'home', null, null),
  (pg_temp.u('c1'), 'game', 'c1', now() - interval '10 days', now() - interval '10 days' + interval '2 hours', 'HC Fanano', 'home', 5, 1),
  (pg_temp.u('a1'), 'game', 'a1', now() - interval '12 days', now() - interval '12 days' + interval '2 hours', 'HC Fanano', 'away', 4, 2);
insert into public.event_groups select pg_temp.u(v.e), g.id from (values ('a0','A'), ('c1','C1'), ('a1','A')) v(e, code)
  join public.groups g on g.code = v.code;
insert into public.league_championships (id, name, position) values (4, 'CATEGORIA A', 1), (5, 'CATEGORIA C1', 2);
insert into public.league_matches (id, championship_id, championship, starts_at, home, away, home_score, away_score) values
  (500, 5, 'CATEGORIA C1', now() - interval '30 days', 'HC FANANO', 'HC SGULARAT C1', 7, 0),
  (501, 4, 'CATEGORIA A', now() - interval '25 days', 'HC FANANO', 'HC SGULARAT', 3, 1);
insert into public.game_predictions (event_id, user_id, pred_for, pred_against)
  values (pg_temp.u('c1'), '00000000-0000-0000-0000-000000000003', 4, 1);

\echo == opponent history only shows what the person may see
select test.login(pg_temp.u('1'));
select test.rows('p1 (A): the A game 12 days ago and the league game of the A team, not the C1 game or the C1 league game', $$select 1 from public.opponent_history(pg_temp.u('a0'))$$, 2);
select test.rows('and the C1 game is not among them', $$select 1 from public.opponent_history(pg_temp.u('a0')) where score_for = 5$$, 0);
select test.rows('and neither is the C1 league game', $$select 1 from public.opponent_history(pg_temp.u('a0')) where source = 'league' and score_against = 7$$, 0);
select test.rows('the history of a C1 game is refused', $$select 1 from public.opponent_history(pg_temp.u('c1'))$$, 0);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('staff see all four meetings', $$select 1 from public.opponent_history(pg_temp.u('a0'))$$, 4);
select test.logout();

\echo == guesses of a game of another group
select test.login(pg_temp.u('1'));
select test.rows('p1 cannot read the guesses of the C1 game', $$select 1 from public.game_predictions where event_id = pg_temp.u('c1')$$, 0);
select test.rows('nor the list with points', $$select 1 from public.game_prediction_list(pg_temp.u('c1'))$$, 0);
select test.logout();
select test.login(pg_temp.u('3'));
select test.rows('p3 reads the guesses of their own game', $$select 1 from public.game_prediction_list(pg_temp.u('c1'))$$, 1);
select test.rows('and the table row', $$select 1 from public.game_predictions where event_id = pg_temp.u('c1')$$, 1);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('staff read the list', $$select 1 from public.game_prediction_list(pg_temp.u('c1'))$$, 1);
select test.logout();

rollback;
\echo ALL OWN GROUPS LEAKS TESTS PASSED
