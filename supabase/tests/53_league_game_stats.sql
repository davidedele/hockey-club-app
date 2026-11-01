begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board');
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;

insert into public.league_championships (id, name, position) values (4, 'CATEGORIA A', 1), (6, 'CATEGORIA C', 2);
insert into public.league_matches (id, championship_id, championship, starts_at, home, away, home_score, away_score) values
  (10, 4, 'CATEGORIA A', now() - interval '10 days', 'HC FIGHTERS', 'HC FANANO', 3, 1),
  (11, 4, 'CATEGORIA A', now() - interval '5 days', 'HC FANANO', 'HC FIGHTERS', 2, 2),
  (12, 4, 'CATEGORIA A', now() - interval '2 days', 'HC FIGHTERS', 'HC TORINO', 1, 0),
  (13, 4, 'CATEGORIA A', now() + interval '3 days', 'HC FIGHTERS', 'HC TORINO', null, null),
  (20, 6, 'CATEGORIA C', now() - interval '4 days', 'HC SGULARAT', 'HC BLACK', 1, 0),
  (21, null, 'OLD', now() - interval '40 days', 'HC OLD', 'HC OLDER', 1, 0);
insert into public.league_sync (id) values (true) on conflict do nothing;

\echo == storing a game (server only)
grant usage on schema test to service_role;
set local role service_role;
select test.works('the server stores the details of game 10', $$select public.league_store_details(10, '{
  "goals": [
    {"side":"home","time":"1:50","scorer":{"number":"22","name":"Nicolo Bravin"},"assists":[{"number":"94","name":"Mirco Giorgetta"},{"number":"7","name":"Third Man"}],"kind":null},
    {"side":"home","time":"13:30","scorer":{"number":"29","name":"Mattia Baraldo"},"assists":[],"kind":"PP1"},
    {"side":"away","time":"28:35","scorer":{"number":"99","name":"ADAM ROMANO"},"assists":[],"kind":"PP1"},
    {"side":"home","time":"40:00","scorer":{"number":"22","name":"NICOLO  BRAVIN"},"assists":[{"number":"94","name":"mirco giorgetta"}],"kind":null}
  ],
  "penalties": [
    {"side":"away","time":"12:07","player":{"number":"91","name":"ELIA BARILLI"},"infraction":"Comportamento antisportivo","minutes":"2:00"},
    {"side":"away","time":"15:00","player":{"number":"91","name":"Elia Barilli"},"infraction":"Sgambetto","minutes":"4:30"}
  ],
  "roster": [
    {"side":"home","role":"Portieri","number":"42","name":"Theo Farano"},
    {"side":"home","role":"Attaccanti","number":"22","name":"Nicolo Bravin"},
    {"side":"away","role":"Attaccanti","number":"99","name":"Adam Romano"}
  ]}'::jsonb)$$);
select test.rows('four goals stored', $$select 1 from public.league_goals where match_id = 10$$, 4);
select test.rows('two penalties stored', $$select 1 from public.league_penalties where match_id = 10$$, 2);
select test.rows('three line-up rows stored', $$select 1 from public.league_lineups where match_id = 10$$, 3);
select test.rows('the team is the league team of the side', $$select 1 from public.league_goals where match_id = 10 and seq = 3 and team = 'HC FANANO'$$, 1);
select test.rows('only two assists are kept', $$select 1 from public.league_goals where match_id = 10 and seq = 1 and assist1_name = 'Mirco Giorgetta' and assist2_name = 'Third Man'$$, 1);
select test.rows('the read is noted', $$select 1 from public.league_match_reads where match_id = 10 and players = 3 and goals = 4 and penalties = 2 and attempts = 1$$, 1);
select test.rows('minutes become seconds', $$select 1 from public.league_penalties where match_id = 10 and seq = 2 and seconds = 270$$, 1);
select test.works('storing again replaces, it does not double', $$select public.league_store_details(10, '{"goals":[{"side":"home","time":"1:50","scorer":{"number":"22","name":"Nicolo Bravin"},"assists":[],"kind":null}],"penalties":[],"roster":[]}'::jsonb)$$);
select test.rows('one goal now', $$select 1 from public.league_goals where match_id = 10$$, 1);
select test.rows('the attempts count went up', $$select 1 from public.league_match_reads where match_id = 10 and attempts = 2$$, 1);
-- Put the four goals back for the totals.
select public.league_store_details(10, '{
  "goals": [
    {"side":"home","time":"1:50","scorer":{"number":"22","name":"Nicolo Bravin"},"assists":[{"number":"94","name":"Mirco Giorgetta"},{"number":"7","name":"Third Man"}],"kind":null},
    {"side":"home","time":"13:30","scorer":{"number":"29","name":"Mattia Baraldo"},"assists":[],"kind":"PP1"},
    {"side":"away","time":"28:35","scorer":{"number":"99","name":"ADAM ROMANO"},"assists":[],"kind":"PP1"},
    {"side":"home","time":"40:00","scorer":{"number":"22","name":"NICOLO  BRAVIN"},"assists":[{"number":"94","name":"mirco giorgetta"}],"kind":null}
  ],
  "penalties": [
    {"side":"away","time":"12:07","player":{"number":"91","name":"ELIA BARILLI"},"infraction":"Comportamento antisportivo","minutes":"2:00"},
    {"side":"away","time":"15:00","player":{"number":"91","name":"Elia Barilli"},"infraction":"Sgambetto","minutes":"4:30"}
  ],
  "roster": [
    {"side":"home","role":"Portieri","number":"42","name":"Theo Farano"},
    {"side":"home","role":"Attaccanti","number":"22","name":"Nicolo Bravin"},
    {"side":"away","role":"Attaccanti","number":"99","name":"Adam Romano"}
  ]}'::jsonb);
select public.league_store_details(11, '{"goals":[{"side":"home","time":"3:00","scorer":{"number":"99","name":"Adam Romano"},"assists":[],"kind":null},{"side":"away","time":"9:00","scorer":{"number":"22","name":"Nicolo Bravin"},"assists":[{"number":"94","name":"Mirco Giorgetta"}],"kind":null}],"penalties":[],"roster":[{"side":"away","role":"Attaccanti","number":"22","name":"Nicolo Bravin"}]}'::jsonb);
select test.fails('a game with no result cannot be stored', $$select public.league_store_details(13, '{}'::jsonb)$$, 'league_match_not_finished');
select test.fails('an unknown game cannot be stored', $$select public.league_store_details(999, '{}'::jsonb)$$, 'league_match_not_finished');
select test.fails('a payload that is not an object is refused', $$select public.league_store_details(12, '[]'::jsonb)$$, 'league_details_invalid');
select test.fails('goals that are not a list are refused', $$select public.league_store_details(12, '{"goals":{}}'::jsonb)$$, 'league_details_invalid');
select test.works('a goal without a scorer name is dropped, not stored', $$select public.league_store_details(12, '{"goals":[{"side":"home","time":"1:00","scorer":{"number":"1","name":" "},"assists":[]}]}'::jsonb)$$);
select test.rows('nothing was stored for game 12', $$select 1 from public.league_goals where match_id = 12$$, 0);

\echo == what is still to be read
select test.rows('pending: games 12 (no details found yet, but 12 hours not passed) are not asked again at once', $$select 1 from public.league_details_pending(10) where match_id = 12$$, 0);
select test.rows('pending: game 20 was never read', $$select 1 from public.league_details_pending(10) where match_id = 20$$, 1);
select test.rows('pending: a game with no result is not asked for', $$select 1 from public.league_details_pending(10) where match_id = 13$$, 0);
select test.rows('pending: a game of no current competition is not asked for', $$select 1 from public.league_details_pending(10) where match_id = 21$$, 0);
select test.rows('pending: a game already read is not asked for', $$select 1 from public.league_details_pending(10) where match_id in (10, 11)$$, 0);
select test.rows('pending: the limit is respected', $$select 1 from public.league_details_pending(1)$$, 1);
update public.league_match_reads set read_at = now() - interval '13 hours' where match_id = 12;
select test.rows('pending: an empty game is asked again after twelve hours', $$select 1 from public.league_details_pending(10) where match_id = 12$$, 1);
update public.league_match_reads set attempts = 3 where match_id = 12;
select test.rows('pending: and given up after three attempts', $$select 1 from public.league_details_pending(10) where match_id = 12$$, 0);

\echo == one reading at a time
select test.rows('the first claim is granted', $$select 1 where public.league_details_claim()$$, 1);
select test.rows('a second claim while it runs is refused', $$select 1 where public.league_details_claim() is true$$, 0);
select public.league_details_finish('test');
select test.rows('and not again within ten minutes', $$select 1 where public.league_details_claim() is true$$, 0);
reset role;
update public.league_sync set details_finished_at = now() - interval '11 minutes', details_started_at = now() - interval '12 minutes';
set local role service_role;
select test.rows('after ten minutes the next claim is granted', $$select 1 where public.league_details_claim() is true$$, 1);
select test.logout();

\echo == totals
select test.login(pg_temp.u('1'));
select test.rows('Bravin is one row although written three ways', $$select 1 from public.league_player_totals(4) where lower(player_name) like 'nicolo%'$$, 1);
select test.rows('Bravin of Fighters: 3 goals, 0 assists, 3 points, 2 games', $$select 1 from public.league_player_totals(4) where lower(player_name) like 'nicolo%' and team = 'HC FIGHTERS' and goals = 3 and assists = 0 and points = 3 and games = 2$$, 1);
select test.rows('Giorgetta of Fighters has 3 assists and no goals', $$select 1 from public.league_player_totals(4) where lower(player_name) = 'mirco giorgetta' and team = 'HC FIGHTERS' and assists = 3 and goals = 0 and points = 3$$, 1);
select test.rows('the same name in another team is not merged', $$select 1 from public.league_player_totals(4) where lower(player_name) = 'mirco giorgetta'$$, 1);
select test.rows('the second assist counts too', $$select 1 from public.league_player_totals(4) where player_name = 'Third Man' and assists = 1$$, 1);
select test.rows('Baraldo has one power play goal', $$select 1 from public.league_player_totals(4) where player_name = 'Mattia Baraldo' and goals = 1 and pp_goals = 1$$, 1);
select test.rows('Romano of Fanano: a power play goal and one more across two games', $$select 1 from public.league_player_totals(4) where lower(player_name) = 'adam romano' and team = 'HC FANANO' and goals = 2 and pp_goals = 1 and games = 2$$, 1);
select test.rows('Barilli has two penalties and 7 minutes (6.5 rounded)', $$select 1 from public.league_player_totals(4) where lower(player_name) = 'elia barilli' and penalties = 2 and penalty_minutes = 7 and games = 1$$, 1);
select test.rows('a goalie with no events has a game and zeros', $$select 1 from public.league_player_totals(4) where player_name = 'Theo Farano' and games = 1 and goals = 0 and points = 0 and penalty_minutes = 0$$, 1);
select test.rows('the number shown is a known one', $$select 1 from public.league_player_totals(4) where player_name = 'Theo Farano' and player_number = '42'$$, 1);
select test.rows('another championship has none of it', $$select 1 from public.league_player_totals(6)$$, 0);
select test.rows('an unknown championship has none', $$select 1 from public.league_player_totals(999)$$, 0);
select test.rows('the tables are readable by a member', $$select 1 from public.league_goals$$, 6);
select test.rows('and the notes of the reads', $$select 1 from public.league_match_reads$$, 3);
select test.fails('a member cannot write a goal', $$insert into public.league_goals (match_id, seq, team, scorer_name) values (10, 50, 'X', 'Y')$$, 'permission denied');
select test.fails('a member cannot write a penalty', $$insert into public.league_penalties (match_id, seq, team, player_name, seconds) values (10, 50, 'X', 'Y', 120)$$, 'permission denied');
select test.fails('a member cannot write a line-up row', $$insert into public.league_lineups (match_id, seq, team, player_name) values (10, 50, 'X', 'Y')$$, 'permission denied');
select test.fails('a member cannot write a read note', $$insert into public.league_match_reads (match_id) values (20)$$, 'permission denied');
select test.fails('a member cannot delete a goal', $$delete from public.league_goals$$, 'permission denied');
select test.fails('a member cannot update a goal', $$update public.league_goals set scorer_name = 'Z'$$, 'permission denied');
select test.fails('a member cannot store details', $$select public.league_store_details(20, '{}'::jsonb)$$, 'permission denied');
select test.fails('a member cannot ask what is pending', $$select * from public.league_details_pending(5)$$, 'permission denied');
select test.fails('a member cannot claim the reading', $$select public.league_details_claim()$$, 'permission denied');
select test.logout();

\echo == a signed in person without a profile
select test.login(pg_temp.u('9'));
select test.rows('sees no goals', $$select 1 from public.league_goals$$, 0);
select test.rows('sees no line-ups', $$select 1 from public.league_lineups$$, 0);
select test.rows('sees no penalties', $$select 1 from public.league_penalties$$, 0);
select test.rows('sees no read notes', $$select 1 from public.league_match_reads$$, 0);
select test.rows('gets no totals', $$select 1 from public.league_player_totals(4)$$, 0);
select test.logout();

\echo == signed out
select test.login_anon();
select test.fails('anonymous cannot read goals', $$select * from public.league_goals$$, 'permission denied');
select test.fails('anonymous cannot read line-ups', $$select * from public.league_lineups$$, 'permission denied');
select test.fails('anonymous cannot read penalties', $$select * from public.league_penalties$$, 'permission denied');
select test.fails('anonymous cannot read read notes', $$select * from public.league_match_reads$$, 'permission denied');
select test.fails('anonymous cannot get totals', $$select * from public.league_player_totals(4)$$, 'permission denied');
select test.fails('anonymous cannot store', $$select public.league_store_details(20, '{}'::jsonb)$$, 'permission denied');
select test.logout();

\echo == the board is a member, not a writer
select test.login(pg_temp.u('b1'));
select test.fails('the board cannot write a goal either', $$insert into public.league_goals (match_id, seq, team, scorer_name) values (10, 51, 'X', 'Y')$$, 'permission denied');
select test.logout();

\echo == a game removed from the league removes its details
delete from public.league_matches where id = 11;
select test.rows('goals of game 11 are gone', $$select 1 from public.league_goals where match_id = 11$$, 0);
select test.rows('and its read note', $$select 1 from public.league_match_reads where match_id = 11$$, 0);
rollback;
\echo ALL LEAGUE GAME STATS TESTS PASSED
