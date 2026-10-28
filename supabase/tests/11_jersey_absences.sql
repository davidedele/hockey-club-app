begin;

-- People: coach1 (coach), p1 and p2 in A, p3 in C1, and u9 without a profile.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000003', 'Pip', 'Three');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('A', '00000000-0000-0000-0000-000000000002'),
    ('C1', '00000000-0000-0000-0000-000000000003')) v(code, uid)
  join public.groups g on g.code = v.code;

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.day(n integer) returns date language sql as $$ select (now() at time zone 'Europe/Rome')::date + n $$;
-- Events start at noon Italian time on the given day, so their date is clear.
create function pg_temp.mk(p_id text, p_day integer, p_group text, p_type public.event_type default 'training') returns void
language plpgsql as $$
declare v_start timestamptz := (pg_temp.day(p_day) + time '12:00') at time zone 'Europe/Rome';
begin
  insert into public.events (id, type, title, starts_at, ends_at)
    values (pg_temp.u(p_id), p_type, p_id, v_start, v_start + interval '1 hour');
  insert into public.event_groups select pg_temp.u(p_id), id from public.groups where code = p_group;
end $$;
select pg_temp.mk('a1', 3, 'A');
select pg_temp.mk('a2', 10, 'A');
select pg_temp.mk('a3', 20, 'A');
select pg_temp.mk('a4', -2, 'A');
select pg_temp.mk('c1', 3, 'C1');
select pg_temp.mk('a5', 6, 'A', 'game');

\echo == jersey colour
select test.login(pg_temp.u('c1'));
select test.affected('a coach sets the jersey of a game', $$update public.events set jersey = 'dark' where id = pg_temp.u('a5')$$, 1);
select test.fails('a training has no jersey colour', $$update public.events set jersey = 'light' where id = pg_temp.u('a1')$$, 'events_jersey_game');
select test.fails('the jersey is light or dark', $$update public.events set jersey = 'red' where id = pg_temp.u('a5')$$, 'check constraint');
select test.logout();
select test.login(pg_temp.u('1'));
select test.affected('a player cannot change the jersey', $$update public.events set jersey = 'light' where id = pg_temp.u('a5')$$, 0);
select test.rows('a player sees the jersey', $$select 1 from public.events where id = pg_temp.u('a5') and jersey = 'dark'$$, 1);
select test.rows('the jerseys are called Chiara and Scura at first', $$select 1 from public.club_settings where jersey_light_name = 'Chiara' and jersey_dark_name = 'Scura'$$, 1);
select test.affected('a player cannot rename the jerseys', $$update public.club_settings set jersey_light_name = 'Gialla'$$, 0);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.affected('a coach cannot rename the jerseys', $$update public.club_settings set jersey_light_name = 'Gialla'$$, 0);
select test.logout();
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now());
insert into public.profiles (id, first_name, last_name) values ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board');
select test.login(pg_temp.u('b1'));
select test.affected('the board renames a jersey', $$update public.club_settings set jersey_light_name = 'Gialla'$$, 1);
select test.fails('a jersey needs a name', $$update public.club_settings set jersey_dark_name = '  '$$, 'check constraint');
select test.logout();

\echo == absence periods
select test.login(pg_temp.u('1'));
select test.works('a player sets their own absence', $$select public.add_absence(pg_temp.u('1'), pg_temp.day(1), pg_temp.day(12), 'travel')$$);
select test.rows('events of their groups in the period get an absent answer', $$select 1 from public.attendance_answers where user_id = pg_temp.u('1') and answer = 'absent' and from_period is not null$$, 3);
select test.rows('an event after the period is left alone', $$select 1 from public.attendance_answers where event_id = pg_temp.u('a3')$$, 0);
select test.rows('a past event is left alone', $$select 1 from public.attendance_answers where event_id = pg_temp.u('a4')$$, 0);
select test.rows('a player sees their own period and reason', $$select 1 from public.absence_periods where reason = 'travel'$$, 1);
select test.fails('a player cannot set an absence for someone else', $$select public.add_absence(pg_temp.u('2'), pg_temp.day(1), pg_temp.day(2))$$, 'forbidden');
select test.fails('a period that already ended is refused', $$select public.add_absence(pg_temp.u('1'), pg_temp.day(-9), pg_temp.day(-1))$$, 'period_past');
select test.fails('the end cannot come before the start', $$select public.add_absence(pg_temp.u('1'), pg_temp.day(5), pg_temp.day(4))$$, 'check constraint');
select test.fails('a period lasts at most a year', $$select public.add_absence(pg_temp.u('1'), pg_temp.day(1), pg_temp.day(400))$$, 'check constraint');
select test.fails('periods are written only through the function', $$insert into public.absence_periods (user_id, starts_on, ends_on) values (pg_temp.u('1'), pg_temp.day(1), pg_temp.day(2))$$, 'permission denied');
select test.works('the player still answers present for one event', $$select public.answer_attendance(pg_temp.u('a2'), 'present')$$);
select test.rows('their own answer replaces the absence', $$select 1 from public.attendance_answers where event_id = pg_temp.u('a2') and answer = 'present' and from_period is null$$, 1);
select test.logout();

select test.login(pg_temp.u('2'));
select test.rows('another player does not see the period', $$select * from public.absence_periods$$, 0);
select test.affected('another player cannot remove it', $$delete from public.absence_periods where user_id = pg_temp.u('1')$$, 0);
select test.logout();

select test.login(pg_temp.u('c1'));
select test.rows('staff see the period and its reason', $$select 1 from public.absence_periods where user_id = pg_temp.u('1') and reason = 'travel'$$, 1);
select test.works('staff set an absence for a player, starting in the past', $$select public.add_absence(pg_temp.u('2'), pg_temp.day(-2), pg_temp.day(8), 'injury')$$);
select test.rows('an event that already ended in the period is left alone', $$select 1 from public.attendance_answers where user_id = pg_temp.u('2') and event_id = pg_temp.u('a4')$$, 0);
select test.rows('the injured player is absent for the events in the period', $$select 1 from public.attendance_answers where user_id = pg_temp.u('2') and answer = 'absent'$$, 2);
select test.works('a new event in the period', $$select public.create_event('training', 'n1', (pg_temp.day(4) + time '20:00') at time zone 'Europe/Rome', (pg_temp.day(4) + time '21:00') at time zone 'Europe/Rome', null, null, array[(select id from public.groups where code = 'A')]::smallint[])$$);
select test.rows('a new event in the period gets the absence too', $$select 1 from public.attendance_answers a join public.events e on e.id = a.event_id where e.title = 'n1' and a.user_id = pg_temp.u('2') and a.answer = 'absent'$$, 1);
select test.rows('someone without a period is not touched by a new event', $$select 1 from public.attendance_answers a join public.events e on e.id = a.event_id where e.title = 'n1' and a.user_id = pg_temp.u('3')$$, 0);
select test.logout();

select test.login(pg_temp.u('1'));
select test.affected('a player removes their own period', $$delete from public.absence_periods where user_id = pg_temp.u('1')$$, 1);
select test.rows('the absences from the period are gone', $$select 1 from public.attendance_answers where user_id = pg_temp.u('1') and answer = 'absent'$$, 0);
select test.rows('the answer they gave themself stays', $$select 1 from public.attendance_answers where user_id = pg_temp.u('1') and event_id = pg_temp.u('a2') and answer = 'present'$$, 1);
select test.logout();

-- An absence that an ended event received while the period existed stays after the period goes.
select test.login(pg_temp.u('3'));
select test.works('a player in C1 sets an absence', $$select public.add_absence(pg_temp.u('3'), pg_temp.day(0), pg_temp.day(30))$$);
select test.logout();
insert into public.attendance_answers (event_id, user_id, answer, from_period)
  select pg_temp.u('a4'), pg_temp.u('3'), 'absent', id from public.absence_periods where user_id = pg_temp.u('3');
select test.login(pg_temp.u('c1'));
select test.affected('staff add the C1 player to group A', $$insert into public.group_members (group_id, user_id) select id, pg_temp.u('3') from public.groups where code = 'A'$$, 1);
select test.rows('joining a group applies the period to its events', $$select 1 from public.attendance_answers where user_id = pg_temp.u('3') and event_id in (pg_temp.u('a1'), pg_temp.u('a2'), pg_temp.u('a3'), pg_temp.u('a5')) and answer = 'absent'$$, 4);
select test.affected('staff remove the C1 player''s period', $$delete from public.absence_periods where user_id = pg_temp.u('3')$$, 1);
select test.logout();
select test.rows('the ended event keeps its absence', $$select 1 from public.attendance_answers where user_id = pg_temp.u('3') and event_id = pg_temp.u('a4') and answer = 'absent' and from_period is null$$, 1);
select test.rows('future events lose it', $$select 1 from public.attendance_answers where user_id = pg_temp.u('3') and event_id <> pg_temp.u('a4')$$, 0);

select test.login(pg_temp.u('9'));
select test.fails('someone without a profile cannot set an absence', $$select public.add_absence(pg_temp.u('9'), pg_temp.day(1), pg_temp.day(2))$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read periods', $$select * from public.absence_periods$$, 'permission denied');
select test.fails('anonymous cannot set an absence', $$select public.add_absence(pg_temp.u('1'), pg_temp.day(1), pg_temp.day(2))$$, 'permission denied');
select test.logout();

rollback;
\echo ALL JERSEY AND ABSENCE TESTS PASSED
