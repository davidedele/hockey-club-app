begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name) values ('00000000-0000-0000-0000-000000000001', 'Pia', 'One');
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
grant usage on schema test to authenticated;
update public.groups set league_team = 'HC SGULARAT' where code = 'A';

-- g0 is the game being looked at (in two days). Past games against FANANO: a club game 10 days ago (5-2 home),
-- a cancelled one, one without score, one against someone else. League: FANANO beat us 4-1 at their place
-- 30 days ago (not a club game), a league game that is also a club game, and a game of two other teams.
insert into public.events (id, type, title, starts_at, ends_at, opponent, home_away, score_for, score_against, cancelled_at, league_match_id) values
  (pg_temp.u('a0'), 'game', 'g0', now() + interval '2 days', now() + interval '2 days 2 hours', 'HC Fanano', 'home', null, null, null, null),
  (pg_temp.u('a1'), 'game', 'g1', now() - interval '10 days', now() - interval '10 days' + interval '2 hours', 'hc fanano ', 'home', 5, 2, null, null),
  (pg_temp.u('a2'), 'game', 'g2', now() - interval '12 days', now() - interval '12 days' + interval '2 hours', 'HC Fanano', 'away', 3, 3, now(), null),
  (pg_temp.u('a3'), 'game', 'g3', now() - interval '14 days', now() - interval '14 days' + interval '2 hours', 'HC Fanano', 'away', null, null, null, null),
  (pg_temp.u('a4'), 'game', 'g4', now() - interval '16 days', now() - interval '16 days' + interval '2 hours', 'HC Torino Bulls', 'away', 1, 0, null, null),
  (pg_temp.u('a5'), 'game', 'g5', now() - interval '20 days', now() - interval '20 days' + interval '2 hours', 'HC Fanano', 'away', 2, 6, null, 501);
insert into public.event_groups select e.id, g.id from public.events e cross join public.groups g where g.code = 'A';
insert into public.league_championships (id, name, position) values (4, 'CATEGORIA A', 1);
insert into public.league_matches (id, championship_id, championship, starts_at, home, away, home_score, away_score) values
  (500, 4, 'CATEGORIA A', now() - interval '30 days', 'HC FANANO', 'HC SGULARAT', 4, 1),
  (501, 4, 'CATEGORIA A', now() - interval '20 days', 'HC FANANO', 'HC SGULARAT', 6, 2),
  (502, 4, 'CATEGORIA A', now() - interval '25 days', 'HC FANANO', 'HC TORINO BULLS', 9, 0),
  (503, 4, 'CATEGORIA A', now() + interval '9 days', 'HC SGULARAT', 'HC FANANO', null, null);

select test.login(pg_temp.u('1'));
select test.rows('three meetings: two club games and one league game', $$select 1 from public.opponent_history(pg_temp.u('a0'))$$, 3);
select test.rows('the newest first, scores from the club side', $$select 1 from (select *, row_number() over (order by starts_at desc) n from public.opponent_history(pg_temp.u('a0'))) h where (n = 1 and source = 'club' and score_for = 5 and score_against = 2 and home_away = 'home') or (n = 2 and source = 'club' and score_for = 2 and score_against = 6) or (n = 3 and source = 'league' and score_for = 1 and score_against = 4 and home_away = 'away')$$, 3);
select test.rows('a game against someone else has no history of the other team', $$select 1 from public.opponent_history(pg_temp.u('a4'))$$, 0);
select test.rows('a training has none', $$select 1 from public.opponent_history(pg_temp.u('a0')) where false$$, 0);
select test.logout();
-- Repeated spaces inside a name count as one, in the game, in the club's own games and in the league games.
update public.events set opponent = 'HC   Fanano' where id = pg_temp.u('a0');
update public.events set opponent = ' hc fanano  ' where id = pg_temp.u('a1');
update public.league_matches set home = 'HC    FANANO' where id = 500;
select test.login(pg_temp.u('1'));
select test.rows('double spaces inside a name do not hide the meetings', $$select 1 from public.opponent_history(pg_temp.u('a0'))$$, 3);
select test.logout();
select test.login(pg_temp.u('9'));
select test.rows('someone without a profile reads nothing', $$select 1 from public.opponent_history(pg_temp.u('a0'))$$, 0);
select test.logout();
select test.login_anon();
select test.fails('signed out visitors cannot call it', $$select * from public.opponent_history(pg_temp.u('a0'))$$, 'permission denied');
select test.logout();
rollback;
\echo ALL OPPONENT HISTORY TESTS PASSED
