begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board'), ('00000000-0000-0000-0000-0000000000c1', 'coach');
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;

insert into public.league_championships (id, name, position) values (4, 'CATEGORIA A', 1), (6, 'CATEGORIA C', 2);
insert into public.league_matches (id, championship_id, championship, starts_at, home, away, home_score, away_score) values
  (10, 4, 'CATEGORIA A', now() - interval '10 days', 'HC FIGHTERS', 'HC FANANO', 3, 1),
  (11, 4, 'CATEGORIA A', now() - interval '5 days', 'HC FANANO', 'HC FIGHTERS', 2, 2),
  (20, 6, 'CATEGORIA C', now() - interval '4 days', 'HC FIGHTERS', 'HC BLACK', 1, 0);
insert into public.league_sync (id) values (true) on conflict do nothing;

-- Game 10: Bravin and "Same Name" of Fighters score (Giorgetta assists), "SAME  NAME" of Fanano scores, Barilli of
-- Fanano is penalised, and Farano of Fighters only plays. Game 11: Bravin scores again. Game 20 (another
-- championship): "Same Name" of Fighters scores.
grant usage on schema test to service_role;
set local role service_role;
select public.league_store_details(10, '{
  "goals": [
    {"side":"home","time":"1:50","scorer":{"number":"22","name":"Nicolo Bravin"},"assists":[{"number":"94","name":"Mirco Giorgetta"}],"kind":null},
    {"side":"home","time":"13:30","scorer":{"number":"5","name":"Same Name"},"assists":[],"kind":null},
    {"side":"away","time":"28:35","scorer":{"number":"6","name":"SAME  NAME"},"assists":[],"kind":null}
  ],
  "penalties": [{"side":"away","time":"12:07","player":{"number":"91","name":"Elia Barilli"},"infraction":"Sgambetto","minutes":"2:00"}],
  "roster": [{"side":"home","role":"Portieri","number":"42","name":"Theo Farano"}]}'::jsonb);
select public.league_store_details(11, '{"goals":[{"side":"away","time":"3:00","scorer":{"number":"22","name":"nicolo  bravin"},"assists":[],"kind":null}],"penalties":[],"roster":[]}'::jsonb);
select public.league_store_details(20, '{"goals":[{"side":"home","time":"3:00","scorer":{"number":"5","name":"Same Name"},"assists":[],"kind":null}],"penalties":[],"roster":[]}'::jsonb);
reset role;

\echo == before anybody is hidden
select test.login(pg_temp.u('1'));
select test.rows('six players in championship 4: Bravin, two Same Name, Giorgetta, Barilli, Farano', $$select 1 from public.league_player_totals(4)$$, 6);
select test.logout();

\echo == who may hide and show
select test.login(pg_temp.u('1'));
select test.fails('a member cannot hide', $$select public.hide_league_player('HC FIGHTERS', 'Same Name')$$, 'forbidden');
select test.fails('a member cannot show', $$select public.show_league_player('HC FIGHTERS', 'Same Name')$$, 'forbidden');
select test.fails('a member cannot read the list', $$select * from public.league_hidden_list()$$, 'forbidden');
select test.fails('a member cannot ask for the names of a team', $$select * from public.league_team_players('HC FIGHTERS')$$, 'forbidden');
select test.fails('a member cannot read the table', $$select * from public.league_hidden_players$$, 'permission denied');
select test.fails('a member cannot write the table', $$insert into public.league_hidden_players (team_key, name_key, team, player_name) values ('a', 'b', 'a', 'b')$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.fails('a coach cannot hide either, only the board', $$select public.hide_league_player('HC FIGHTERS', 'Same Name')$$, 'forbidden');
select test.logout();
select test.login(pg_temp.u('9'));
select test.fails('a person without a profile cannot hide', $$select public.hide_league_player('HC FIGHTERS', 'Same Name')$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot hide', $$select public.hide_league_player('HC FIGHTERS', 'Same Name')$$, 'permission denied');
select test.fails('anonymous cannot read the table', $$select * from public.league_hidden_players$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('b1'));
select test.fails('even the board cannot read the table directly', $$select * from public.league_hidden_players$$, 'permission denied');
select test.fails('a blank name is refused', $$select public.hide_league_player('HC FIGHTERS', '   ')$$, 'league_hidden_invalid');
select test.fails('a blank team is refused', $$select public.hide_league_player('', 'Same Name')$$, 'league_hidden_invalid');
select test.fails('a null name is refused', $$select public.hide_league_player('HC FIGHTERS', null)$$, 'league_hidden_invalid');
select test.fails('a very long name is refused', $$select public.hide_league_player('HC FIGHTERS', repeat('x', 121))$$, 'league_hidden_invalid');
select test.rows('the board has nothing hidden yet', $$select 1 from public.league_hidden_list()$$, 0);
select test.rows('the board gets the names of Fighters, each once', $$select 1 from public.league_team_players('hc  fighters')$$, 4);
select test.rows('and of Fanano', $$select 1 from public.league_team_players('HC FANANO')$$, 2);
select test.logout();

\echo == hiding a player
select test.login(pg_temp.u('b1'));
select test.works('the board hides Same Name of Fighters, written with other case and spaces', $$select public.hide_league_player('  hc FIGHTERS ', 'same   NAME ')$$);
select test.rows('one row in the list, with the name as typed (trimmed) and who hid it', $$select 1 from public.league_hidden_list() where team = 'hc FIGHTERS' and player_name = 'same   NAME' and hidden_by_name = 'Board Bea'$$, 1);
select test.works('the same hide twice is harmless', $$select public.hide_league_player('HC FIGHTERS', 'Same Name')$$);
select test.rows('still one row', $$select 1 from public.league_hidden_list()$$, 1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('a member now sees five players', $$select 1 from public.league_player_totals(4)$$, 5);
select test.rows('the Same Name of Fanano is still there with its goal', $$select 1 from public.league_player_totals(4) where team = 'HC FANANO' and lower(player_name) like 'same%' and goals = 1$$, 1);
select test.rows('the Same Name of Fighters is gone', $$select 1 from public.league_player_totals(4) where team = 'HC FIGHTERS' and lower(player_name) like 'same%'$$, 0);
select test.rows('and from the other championship too, as the person is the same', $$select 1 from public.league_player_totals(6)$$, 0);
select test.rows('Bravin is untouched: 2 goals in 2 games', $$select 1 from public.league_player_totals(4) where lower(player_name) like 'nicolo%' and goals = 2 and games = 2 and points = 2$$, 1);
select test.logout();

\echo == all four tabs and the games played
select test.login(pg_temp.u('b1'));
select public.hide_league_player('HC FIGHTERS', 'Mirco Giorgetta');
select public.hide_league_player('HC FANANO', 'Elia Barilli');
select public.hide_league_player('HC FIGHTERS', 'Theo Farano');
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('Giorgetta is out of the assists tab', $$select 1 from public.league_player_totals(4) where assists > 0 and lower(player_name) like 'mirco%'$$, 0);
select test.rows('and out of the points tab', $$select 1 from public.league_player_totals(4) where points > 0 and lower(player_name) like 'mirco%'$$, 0);
select test.rows('Barilli is out of the penalties tab', $$select 1 from public.league_player_totals(4) where penalties > 0$$, 0);
select test.rows('Farano, who only played, is out of the games count', $$select 1 from public.league_player_totals(4) where lower(player_name) like 'theo%'$$, 0);
select test.rows('the scorers tab still has Bravin and the Fanano Same Name', $$select 1 from public.league_player_totals(4) where goals > 0$$, 2);
select test.rows('only those two players are left in the totals', $$select 1 from public.league_player_totals(4)$$, 2);
select test.logout();
reset role;
select test.rows('the stored game rows stay: goals', $$select 1 from public.league_goals$$, 5);
select test.rows('the stored penalties stay', $$select 1 from public.league_penalties$$, 1);
select test.rows('the stored line-ups stay', $$select 1 from public.league_lineups$$, 1);

\echo == showing again
select test.login(pg_temp.u('b1'));
select test.works('the board shows Giorgetta again, spelled differently', $$select public.show_league_player(' hc fighters', 'MIRCO  GIORGETTA')$$);
select test.works('showing again twice is harmless', $$select public.show_league_player('HC FIGHTERS', 'Mirco Giorgetta')$$);
select test.works('showing a player who was never hidden is harmless', $$select public.show_league_player('HC FIGHTERS', 'Nobody')$$);
select test.works('Same Name of Fighters is shown again', $$select public.show_league_player('HC FIGHTERS', 'Same Name')$$);
select test.rows('three are still hidden or less: Barilli and Farano', $$select 1 from public.league_hidden_list()$$, 2);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('Giorgetta is back with his assist in one game', $$select 1 from public.league_player_totals(4) where lower(player_name) = 'mirco giorgetta' and assists = 1 and games = 1$$, 1);
select test.rows('Same Name of Fighters is back with its goal', $$select 1 from public.league_player_totals(4) where team = 'HC FIGHTERS' and lower(player_name) like 'same%' and goals = 1$$, 1);
select test.rows('and in the other championship', $$select 1 from public.league_player_totals(6)$$, 1);
select test.rows('Barilli and Farano stay hidden', $$select 1 from public.league_player_totals(4) where lower(player_name) in ('elia barilli', 'theo farano')$$, 0);
select test.logout();
rollback;
\echo ALL LEAGUE HIDDEN PLAYERS TESTS PASSED
