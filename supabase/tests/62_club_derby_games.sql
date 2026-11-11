begin;

-- People: coach1, p1 in C1 (the Yellow team), p2 in C2 (the other C team).
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000c1', 'coach');
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.g(p text) returns smallint language sql as $$ select id from public.groups where code = p $$;
create function pg_temp.at(n integer, hh integer) returns timestamptz language sql as
  $$ select (((now() at time zone 'Europe/Rome')::date + n) + make_time(hh, 0, 0)) at time zone 'Europe/Rome' $$;
insert into public.group_members (group_id, user_id) values (pg_temp.g('C1'), pg_temp.u('1')), (pg_temp.g('C2'), pg_temp.u('2'));

insert into public.league_championships (id, name, position) values (6, 'CATEGORIA C', 3);
update public.groups set league_team = 'HC SGULARAT YELLOW', league_championships = '{6}' where code = 'C1';
update public.groups set league_team = 'HC SGULARAT', league_championships = '{6}' where code = 'C2';
insert into public.league_matches (id, championship_id, championship, starts_at, home, away, home_score, away_score, venue) values
  (301, 6, 'CATEGORIA C', pg_temp.at(10, 18), 'HC SGULARAT YELLOW', 'HC SGULARAT', null, null, 'PALASESTO'),
  (302, 6, 'CATEGORIA C', pg_temp.at(-5, 18), 'HC SGULARAT', 'HC SGULARAT YELLOW', 2, 4, 'PALASESTO');
create function pg_temp.ev(p integer, s text) returns uuid language sql as
  $$ select id from public.events where league_match_id = p and league_side = s $$;
create function pg_temp.groups_of(p uuid) returns text language sql as
  $$ select string_agg(g.code, ',' order by g.code) from public.event_groups eg join public.groups g on g.id = eg.group_id where eg.event_id = p $$;

\echo == one game per team
select test.rows('the reading makes one game per side', $$select 1 where public.apply_league_matches() = 4$$, 1);
select test.rows('the home game belongs to the Yellow team only', $$select 1 where pg_temp.groups_of(pg_temp.ev(301, 'home')) = 'C1'$$, 1);
select test.rows('the away game belongs to the other team only', $$select 1 where pg_temp.groups_of(pg_temp.ev(301, 'away')) = 'C2'$$, 1);
select test.rows('the Yellow team plays at home against the other team', $$select 1 from public.events where id = pg_temp.ev(301, 'home') and home_away = 'home' and opponent = 'HC Sgularat'$$, 1);
select test.rows('the other team plays away against the Yellow team', $$select 1 from public.events where id = pg_temp.ev(301, 'away') and home_away = 'away' and opponent = 'HC Sgularat Yellow'$$, 1);
select test.rows('each side sees the score from its own side', $$select 1 from public.events where (id = pg_temp.ev(302, 'home') and score_for = 2 and score_against = 4) or (id = pg_temp.ev(302, 'away') and score_for = 4 and score_against = 2)$$, 2);
select test.rows('reading again makes nothing new', $$select 1 where public.apply_league_matches() = 0$$, 1);

select test.login(pg_temp.u('1'));
select test.works('a Yellow player answers their game', $$select public.answer_attendance(pg_temp.ev(301, 'home'), 'present')$$);
select test.fails('a Yellow player cannot answer the other team''s game', $$select public.answer_attendance(pg_temp.ev(301, 'away'), 'present')$$, '');
select test.logout();
select test.rows('the other team''s game has no answers', $$select 1 from public.attendance_answers where event_id = pg_temp.ev(301, 'away')$$, 0);

\echo == deleting one side
select test.login(pg_temp.u('c1'));
select test.affected('staff delete the away game', $$delete from public.events where id = pg_temp.ev(301, 'away')$$, 1);
select test.logout();
select test.works('the site is read again', $$select public.apply_league_matches()$$);
select test.rows('the deleted side does not come back', $$select 1 from public.events where league_match_id = 301 and league_side = 'away'$$, 0);
select test.rows('the other side stays', $$select 1 from public.events where league_match_id = 301 and league_side = 'home'$$, 1);
update public.league_matches set starts_at = pg_temp.at(11, 20) where id = 301;
select test.works('the site is read once more', $$select public.apply_league_matches()$$);
select test.rows('the side still there follows a moved match', $$select 1 from public.events where id = pg_temp.ev(301, 'home') and starts_at = pg_temp.at(11, 20)$$, 1);

\echo == splitting a game shared from before
insert into public.league_matches (id, championship_id, championship, starts_at, home, away, home_score, away_score, venue) values
  (303, 6, 'CATEGORIA C', pg_temp.at(20, 18), 'HC SGULARAT YELLOW', 'HC SGULARAT', null, null, 'PALASESTO');
insert into public.events (id, type, title, starts_at, ends_at, opponent, home_away, league_match_id, league_side) values
  (pg_temp.u('e1'), 'game', 'Partita', pg_temp.at(20, 18), pg_temp.at(20, 19), 'HC Sgularat', 'home', 303, 'home');
insert into public.event_groups (event_id, group_id) values (pg_temp.u('e1'), pg_temp.g('C1')), (pg_temp.u('e1'), pg_temp.g('C2'));
insert into public.attendance_answers (event_id, user_id, answer) values (pg_temp.u('e1'), pg_temp.u('1'), 'present'), (pg_temp.u('e1'), pg_temp.u('2'), 'present');
select test.rows('the other team leaves the shared game', $$select 1 where public.tidy_league_event_groups() = 1 and pg_temp.groups_of(pg_temp.u('e1')) = 'C1'$$, 1);
select test.rows('its player''s answer leaves with it', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e1') and user_id = pg_temp.u('2')$$, 0);
select test.rows('the Yellow player''s answer stays', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e1') and user_id = pg_temp.u('1')$$, 1);
select test.rows('the next reading gives the other team its own game', $$select 1 where public.apply_league_matches() = 1 and pg_temp.groups_of(pg_temp.ev(303, 'away')) = 'C2'$$, 1);

\echo == a league game always has a side
select test.works('a league game made without a side', $$insert into public.events (id, type, title, starts_at, ends_at, league_match_id) values (pg_temp.u('e2'), 'game', 'X', pg_temp.at(30, 18), pg_temp.at(30, 19), 304)$$);
select test.rows('gets the home side', $$select 1 from public.events where id = pg_temp.u('e2') and league_side = 'home'$$, 1);
select test.works('an event taken out of the league', $$update public.events set league_match_id = null where id = pg_temp.u('e2')$$);
select test.rows('loses its side', $$select 1 from public.events where id = pg_temp.u('e2') and league_side is null$$, 1);

rollback;
\echo 'ALL CLUB DERBY TESTS PASSED'
