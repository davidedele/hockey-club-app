begin;

-- People: board1 (board), coach1 (coach), p1 in A, p3 in C2 with an absence, u9 without a profile.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000003', 'Pip', 'Three');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('C2', '00000000-0000-0000-0000-000000000003')) v(code, uid)
  join public.groups g on g.code = v.code;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.at(n integer, hh integer) returns timestamptz language sql as
  $$ select (((now() at time zone 'Europe/Rome')::date + n) + make_time(hh, 0, 0)) at time zone 'Europe/Rome' $$;
create function pg_temp.g(p text) returns smallint language sql as $$ select id from public.groups where code = p $$;

-- What the website said: competitions, matches and one standings table.
insert into public.league_championships (id, name, position) values (4, 'CATEGORIA A', 1), (6, 'CATEGORIA C', 3), (8, 'COPPA DELLE REGIONI', 7);
insert into public.league_matches (id, championship_id, championship, starts_at, home, away, home_score, away_score, venue) values
  (99, 4, 'CATEGORIA A', pg_temp.at(9, 18), 'HC VARESE KILLER BEES', 'HC SGULARAT', null, null, 'ACINQUE ICE ARENA'),
  (100, 4, 'CATEGORIA A', pg_temp.at(-3, 12), 'HC SGULARAT', 'HC FANANO', 5, 2, 'PALASESTO'),
  (101, 8, 'COPPA DELLE REGIONI', pg_temp.at(20, 18), 'HC FANANO', 'HC SGULARAT', null, null, 'PALAGHIACCIO FANANO'),
  (130, 6, 'CATEGORIA C', pg_temp.at(2, 18), 'HC DIAVOLI ROSSONERI', 'HC SGULARAT YELLOW', null, null, 'PALASESTO'),
  (131, 6, 'CATEGORIA C', pg_temp.at(4, 12), 'HC SGULARAT', 'HC FIGHTERS 2', null, null, 'PALASESTO'),
  (140, 4, 'CATEGORIA A', pg_temp.at(5, 20), 'HC FIGHTERS', 'HC TORINO BULLS', null, null, 'ASSAGO FORUM');
insert into public.league_standings (championship_id, position, team, played, points, goal_diff) values
  (4, 1, 'HC SGULARAT', 1, 2, 3), (4, 2, 'HC FANANO', 1, 0, -3);
-- p3 is away for the next week.
insert into public.absence_periods (user_id, starts_on, ends_on) values (pg_temp.u('3'), (now() at time zone 'Europe/Rome')::date, (now() at time zone 'Europe/Rome')::date + 7);

\echo == reading league data
select test.login(pg_temp.u('1'));
select test.rows('a member reads the matches', $$select * from public.league_matches$$, 6);
select test.rows('a member reads the standings', $$select * from public.league_standings$$, 2);
select test.rows('a member reads when the site was last read', $$select * from public.league_sync$$, 1);
select test.fails('a member cannot write matches', $$insert into public.league_matches (id, championship, starts_at, home, away) values (1, 'X', now(), 'a', 'b')$$, 'permission denied');
select test.fails('a member cannot change the standings', $$update public.league_standings set points = 99$$, 'permission denied');
select test.fails('a member cannot create league games', $$select public.apply_league_matches()$$, 'permission denied');
select test.fails('a member cannot start a reading', $$select public.league_sync_claim(true)$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('9'));
select test.rows('someone without a profile sees no matches', $$select * from public.league_matches$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read matches', $$select * from public.league_matches$$, 'permission denied');
select test.logout();

\echo == linking groups to league teams
select test.login(pg_temp.u('c1'));
select test.affected('a coach cannot link a group to a league team', $$update public.groups set league_team = 'HC SGULARAT' where code = 'A'$$, 0);
select test.logout();
select test.login(pg_temp.u('b1'));
select test.affected('the board links A', $$update public.groups set league_team = 'HC SGULARAT', league_championships = '{4,8}' where code = 'A'$$, 1);
select test.affected('the board links C2', $$update public.groups set league_team = 'HC SGULARAT YELLOW', league_championships = '{6}' where code = 'C2'$$, 1);
select test.logout();

\echo == league games become events
-- A game of A created by hand on the day of match 99.
insert into public.events (id, type, title, starts_at, ends_at, meetup_at, opponent)
  values (pg_temp.u('e9'), 'game', 'Partita', pg_temp.at(9, 17), pg_temp.at(9, 19), pg_temp.at(9, 16), 'Varese');
insert into public.event_groups values (pg_temp.u('e9'), pg_temp.g('A'));
select test.rows('the reading creates the games that were not there', $$select 1 where public.apply_league_matches() = 3$$, 1);
select test.rows('a game by hand on the same day is linked, not doubled', $$select 1 from public.events where league_match_id = 99 and id = pg_temp.u('e9')$$, 1);
select test.rows('the linked game takes the league time and keeps its length and meetup', $$select 1 from public.events where id = pg_temp.u('e9') and starts_at = pg_temp.at(9, 18) and ends_at = pg_temp.at(9, 20) and meetup_at = pg_temp.at(9, 17)$$, 1);
select test.rows('the opponent and side come from the league', $$select 1 from public.events where league_match_id = 99 and opponent = 'HC Varese Killer Bees' and home_away = 'away' and venue = 'Acinque Ice Arena'$$, 1);
select test.rows('a played match brings its score, seen from our side', $$select 1 from public.events where league_match_id = 100 and score_for = 5 and score_against = 2 and home_away = 'home'$$, 1);
select test.rows('the cup game is created for A too', $$select 1 from public.events e join public.event_groups eg on eg.event_id = e.id where e.league_match_id = 101 and eg.group_id = pg_temp.g('A')$$, 1);
select test.rows('a created away game is away, against the other team', $$select 1 from public.events where league_match_id = 130 and home_away = 'away' and opponent = 'HC Diavoli Rossoneri'$$, 1);
select test.rows('the C2 game goes to C2', $$select 1 from public.events e join public.event_groups eg on eg.event_id = e.id where e.league_match_id = 130 and eg.group_id = pg_temp.g('C2')$$, 1);
select test.rows('a Categoria C match of HC SGULARAT is not an A game', $$select 1 from public.events where league_match_id = 131$$, 0);
select test.rows('other teams'' matches are not events', $$select 1 from public.events where league_match_id = 140$$, 0);
select test.rows('an absence covers a league game too', $$select 1 from public.attendance_answers a join public.events e on e.id = a.event_id where e.league_match_id = 130 and a.user_id = pg_temp.u('3') and a.answer = 'absent'$$, 1);
select test.rows('reading again creates nothing new', $$select 1 where public.apply_league_matches() = 0$$, 1);
select test.rows('one event per match', $$select 1 from public.events where league_match_id is not null$$, 4);
update public.league_matches set starts_at = pg_temp.at(21, 15) where id = 101;
select test.works('the site is read again', $$select public.apply_league_matches()$$);
select test.rows('a moved match moves its game', $$select 1 from public.events e where e.league_match_id = 101 and e.starts_at = pg_temp.at(21, 15)$$, 1);

select test.login(pg_temp.u('c1'));
select test.affected('staff delete a league game they do not want', $$delete from public.events where league_match_id = 101$$, 1);
select test.logout();
select test.works('the site is read once more', $$select public.apply_league_matches()$$);
select test.rows('a deleted league game does not come back', $$select 1 from public.events e where e.league_match_id = 101$$, 0);

\echo == one reading at a time
select test.rows('the first reading starts', $$select 1 where public.league_sync_claim() is true$$, 1);
select test.rows('a second reading cannot start while one runs', $$select 1 where public.league_sync_claim(true) is null$$, 1);
select test.works('the reading finishes', $$select public.league_sync_finish(true)$$);
select test.rows('a fresh reading is not repeated', $$select 1 where public.league_sync_claim() is null$$, 1);
select test.rows('staff can ask for a new reading anyway', $$select 1 where public.league_sync_claim(true) is true$$, 1);
select test.works('it finishes', $$select public.league_sync_finish(false, 'site changed')$$);
select test.rows('the outcome is kept', $$select 1 from public.league_sync where ok = false and message = 'site changed'$$, 1);

rollback;
\echo ALL LEAGUE TESTS PASSED
