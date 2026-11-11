begin;

-- People: board1, p1 in A and B, p2 in B only.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board');
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.g(p text) returns smallint language sql as $$ select id from public.groups where code = p $$;
create function pg_temp.at(n integer, hh integer) returns timestamptz language sql as
  $$ select (((now() at time zone 'Europe/Rome')::date + n) + make_time(hh, 0, 0)) at time zone 'Europe/Rome' $$;
insert into public.group_members (group_id, user_id) values
  (pg_temp.g('A'), pg_temp.u('1')), (pg_temp.g('B'), pg_temp.u('1')), (pg_temp.g('B'), pg_temp.u('2'));

-- A and B play under the same league name. By mistake B also has the regional cup.
insert into public.league_championships (id, name, position) values (4, 'CATEGORIA A', 1), (5, 'CATEGORIA B', 2), (8, 'COPPA DELLE REGIONI', 7);
update public.groups set league_team = 'HC SGULARAT', league_championships = '{4,8}' where code = 'A';
update public.groups set league_team = 'HC SGULARAT', league_championships = '{5,8}' where code = 'B';
insert into public.league_matches (id, championship_id, championship, starts_at, home, away, home_score, away_score, venue) values
  (201, 8, 'COPPA DELLE REGIONI', pg_temp.at(10, 18), 'HC FANANO', 'HC SGULARAT', null, null, 'PALAGHIACCIO FANANO'),
  (202, 5, 'CATEGORIA B', pg_temp.at(12, 18), 'HC SGULARAT', 'HC FANANO', null, null, 'PALASESTO'),
  (203, 8, 'COPPA DELLE REGIONI', pg_temp.at(-10, 18), 'HC SGULARAT', 'HC TORINO BULLS', 3, 1, 'PALASESTO');
select public.apply_league_matches();
create function pg_temp.ev(p integer) returns uuid language sql as $$ select id from public.events where league_match_id = p $$;
create function pg_temp.groups_of(p integer) returns text language sql as
  $$ select string_agg(g.code, ',' order by g.code) from public.event_groups eg join public.groups g on g.id = eg.group_id where eg.event_id = pg_temp.ev(p) $$;

\echo == league games follow the group links
select test.rows('with the mistake, the cup game is shown to A and B', $$select 1 where pg_temp.groups_of(201) = 'A,B'$$, 1);
select test.login(pg_temp.u('2'));
select test.works('a B player answers the cup game', $$select public.answer_attendance(pg_temp.ev(201), 'present')$$);
select test.logout();
select test.login(pg_temp.u('1'));
select test.works('a player in A and B answers the cup game', $$select public.answer_attendance(pg_temp.ev(201), 'present')$$);
select test.logout();

select test.login(pg_temp.u('b1'));
select test.affected('the board takes the cup away from B', $$update public.groups set league_championships = '{5}' where code = 'B'$$, 1);
select test.logout();
select test.rows('the coming cup game is now shown to A only', $$select 1 where pg_temp.groups_of(201) = 'A'$$, 1);
select test.rows('the answer of the B only player goes', $$select 1 from public.attendance_answers where event_id = pg_temp.ev(201) and user_id = pg_temp.u('2')$$, 0);
select test.rows('the answer of the player also in A stays', $$select 1 from public.attendance_answers where event_id = pg_temp.ev(201) and user_id = pg_temp.u('1')$$, 1);
select test.rows('a finished cup game keeps its groups', $$select 1 where pg_temp.groups_of(203) = 'A,B'$$, 1);
select test.rows('the B league game is untouched', $$select 1 where pg_temp.groups_of(202) = 'B'$$, 1);

select test.login(pg_temp.u('b1'));
select test.affected('the board unlinks B from the league', $$update public.groups set league_team = null, league_championships = '{}' where code = 'B'$$, 1);
select test.logout();
select test.rows('a game with no matching group keeps its group', $$select 1 where pg_temp.groups_of(202) = 'B'$$, 1);
select test.rows('a later reading does not bring B back to the cup', $$select 1 where public.apply_league_matches() >= 0 and pg_temp.groups_of(201) = 'A'$$, 1);

\echo == leaving a group
insert into public.events (id, type, title, starts_at, ends_at) values
  (pg_temp.u('e1'), 'training', 'Allenamento B', pg_temp.at(3, 22), pg_temp.at(3, 23)),
  (pg_temp.u('e2'), 'training', 'Allenamento A e B', pg_temp.at(4, 22), pg_temp.at(4, 23)),
  (pg_temp.u('e3'), 'training', 'Allenamento passato', pg_temp.at(-4, 22), pg_temp.at(-4, 23));
insert into public.event_groups (event_id, group_id) values
  (pg_temp.u('e1'), pg_temp.g('B')), (pg_temp.u('e2'), pg_temp.g('A')), (pg_temp.u('e2'), pg_temp.g('B')), (pg_temp.u('e3'), pg_temp.g('B'));
insert into public.attendance_answers (event_id, user_id, answer) values
  (pg_temp.u('e1'), pg_temp.u('1'), 'present'), (pg_temp.u('e2'), pg_temp.u('1'), 'present'),
  (pg_temp.u('e3'), pg_temp.u('1'), 'present'), (pg_temp.u('e1'), pg_temp.u('2'), 'present');

select test.login(pg_temp.u('b1'));
select test.affected('the board takes p1 out of B', $$delete from public.group_members where user_id = pg_temp.u('1') and group_id = pg_temp.g('B')$$, 1);
select test.logout();
select test.rows('the answer on a coming B training goes', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e1') and user_id = pg_temp.u('1')$$, 0);
select test.rows('the answer on a training also for A stays', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e2') and user_id = pg_temp.u('1')$$, 1);
select test.rows('a finished training keeps the answer', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e3') and user_id = pg_temp.u('1')$$, 1);
select test.rows('the answers of people still in B stay', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e1') and user_id = pg_temp.u('2')$$, 1);

\echo == nobody calls the helpers directly
select test.login(pg_temp.u('b1'));
select test.fails('the board cannot call the tidy function', $$select public.tidy_league_event_groups()$$, 'permission denied');
select test.fails('the board cannot call the clearing function', $$select public.clear_uninvited(pg_temp.u('e1'))$$, 'permission denied');
select test.logout();

rollback;
\echo 'ALL STALE GROUP LINK TESTS PASSED'
