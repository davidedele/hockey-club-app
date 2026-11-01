begin;

-- People: board1 (board), coach1 (coach), p1 (player in A), p2 (player in A and B),
-- p3 (player in C1), stranger (confirmed account, no profile).
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-0000000000d1', 'stranger@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000003', 'Pip', 'Three');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('A', '00000000-0000-0000-0000-000000000002'),
    ('B', '00000000-0000-0000-0000-000000000002'),
    ('C1', '00000000-0000-0000-0000-000000000003')) v(code, uid)
  join public.groups g on g.code = v.code;

\echo == creating events
select test.login('00000000-0000-0000-0000-000000000001');
select test.fails('player cannot create an event', $$select public.create_event('training', 'X', now() + interval '1 day', now() + interval '2 days', null, null, array[1]::smallint[])$$, 'forbidden');
select test.fails('player cannot insert an event directly', $$insert into public.events (type, title, starts_at, ends_at) values ('training', 'X', now(), now() + interval '1 hour')$$, 'permission denied');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot create an event', $$select public.create_event('training', 'X', now(), now() + interval '1 hour', null, null, array[1]::smallint[])$$, 'permission denied');
select test.fails('anonymous cannot read events', 'select * from public.events', 'permission denied');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000c1');
select test.works('coach creates a training for group A', $$select public.create_event('training', 'Allenamento A', timestamptz '2027-03-04 22:30 Europe/Rome', timestamptz '2027-03-04 23:55 Europe/Rome', timestamptz '2027-03-04 21:30 Europe/Rome', 'Pista', array[(select id from public.groups where code = 'A')])$$);
select test.rows('a single event has no series', $$select * from public.events where title = 'Allenamento A' and series_id is null$$, 1);
-- 2026-10-22 is a Thursday. Summer time ends on 2026-10-25, so the series crosses the change.
select test.works('coach creates a weekly series', $$select public.create_event('training', 'Giovedì', timestamptz '2026-10-22 22:30 Europe/Rome', timestamptz '2026-10-22 23:55 Europe/Rome', timestamptz '2026-10-22 21:30 Europe/Rome', 'Pista', array[(select id from public.groups where code = 'A'), (select id from public.groups where code = 'B')], null, null, 6)$$);
select test.rows('a series of 6 repeats makes 7 events', $$select * from public.events where title = 'Giovedì'$$, 7);
select test.rows('all events of a series share one series id', $$select series_id from public.events where title = 'Giovedì' group by series_id$$, 1);
select test.rows('the series keeps 22:30 in Italy through the clock change', $$select * from public.events where title = 'Giovedì' and (starts_at at time zone 'Europe/Rome')::time = '22:30'$$, 7);
select test.rows('the series keeps meetup 21:30 and end 23:55', $$select * from public.events where title = 'Giovedì' and (meetup_at at time zone 'Europe/Rome')::time = '21:30' and (ends_at at time zone 'Europe/Rome')::time = '23:55'$$, 7);
select test.rows('each event of the series has both groups', $$select event_id from public.event_groups eg join public.events e on e.id = eg.event_id where e.title = 'Giovedì' group by event_id having count(*) = 2$$, 7);
select test.rows('the series spans the clock change', $$select * from public.events where title = 'Giovedì' and starts_at = timestamptz '2026-10-29 22:30 Europe/Rome' and starts_at - timestamptz '2026-10-22 22:30 Europe/Rome' = interval '7 days 1 hour'$$, 1);
select test.works('coach creates a game for A and B', $$select public.create_event('game', 'Partita', timestamptz '2027-03-07 20:00 Europe/Rome', timestamptz '2027-03-07 22:00 Europe/Rome', timestamptz '2027-03-07 19:00 Europe/Rome', 'Pista', array[(select id from public.groups where code = 'A'), (select id from public.groups where code = 'B')], 'Orsi', 'home')$$);
select test.works('coach creates a training for C1', $$select public.create_event('training', 'Allenamento C1', timestamptz '2027-03-05 21:00 Europe/Rome', timestamptz '2027-03-05 22:30 Europe/Rome', null, null, array[(select id from public.groups where code = 'C1')])$$);
select test.fails('a game cannot repeat', $$select public.create_event('game', 'G', now(), now() + interval '1 hour', null, null, array[1]::smallint[], 'X', 'away', 3)$$, 'repeat_only_training');
select test.fails('repeats are limited', $$select public.create_event('training', 'T', now(), now() + interval '1 hour', null, null, array[1]::smallint[], null, null, 60)$$, 'repeat_invalid');
select test.fails('an event needs a group', $$select public.create_event('training', 'T', now(), now() + interval '1 hour', null, null, array[]::smallint[])$$, 'groups_required');
select test.fails('an unknown group is refused', $$select public.create_event('training', 'T', now(), now() + interval '1 hour', null, null, array[999]::smallint[])$$, 'groups_required');
select test.fails('the end must be after the start', $$select public.create_event('training', 'T', now(), now() - interval '1 hour', null, null, array[1]::smallint[])$$, 'check constraint');
select test.fails('the meetup cannot be after the start', $$select public.create_event('training', 'T', now(), now() + interval '1 hour', now() + interval '10 minutes', null, array[1]::smallint[])$$, 'check constraint');
select test.fails('a training cannot have an opponent', $$update public.events set opponent = 'X' where title = 'Allenamento A'$$, 'check constraint');
select test.fails('a score needs both numbers', $$update public.events set score_for = 3 where title = 'Partita'$$, 'check constraint');
select test.affected('coach sets the final score', $$update public.events set score_for = 4, score_against = 2 where title = 'Partita'$$, 1);
select test.affected('coach changes the venue', $$update public.events set venue = 'Pista 2' where title = 'Allenamento A'$$, 1);
select test.logout();

\echo == who sees which event
select test.login('00000000-0000-0000-0000-000000000001');
select test.rows('player in A sees the A events once', $$select * from public.events$$, 9);
select test.rows('player in A does not see the C1 training', $$select * from public.events where title = 'Allenamento C1'$$, 0);
select test.rows('player in A sees the groups of an event', $$select * from public.event_groups eg join public.events e on e.id = eg.event_id where e.title = 'Partita'$$, 2);
select test.logout();
select test.login('00000000-0000-0000-0000-000000000002');
select test.rows('player in A and B sees an event for both groups once', $$select * from public.events where title = 'Partita'$$, 1);
select test.logout();
select test.login('00000000-0000-0000-0000-000000000003');
select test.rows('player in C1 sees only the C1 training', $$select * from public.events$$, 1);
select test.rows('player in C1 sees no A event groups', $$select * from public.event_groups eg join public.events e on e.id = eg.event_id where e.title = 'Partita'$$, 0);
select test.affected('player cannot change an event', $$update public.events set venue = 'X'$$, 0);
select test.affected('player cannot delete an event', $$delete from public.events$$, 0);
select test.fails('player cannot add a group to an event', $$insert into public.event_groups select id, 1 from public.events$$, 'row-level security');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000d1');
select test.rows('account without profile sees no events', 'select * from public.events', 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.rows('board sees every event', 'select * from public.events', 10);
select test.logout();

\echo == groups of an event
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.fails('an event keeps at least one group', $$delete from public.event_groups where event_id = (select id from public.events where title = 'Allenamento C1')$$, 'event_needs_group');
select test.works('coach adds a group to an event', $$insert into public.event_groups select id, (select id from public.groups where code = 'C2') from public.events where title = 'Allenamento C1'$$);
select test.affected('coach removes one of two groups', $$delete from public.event_groups where group_id = (select id from public.groups where code = 'C1') and event_id = (select id from public.events where title = 'Allenamento C1')$$, 1);
select test.fails('the last group still cannot be removed', $$delete from public.event_groups where event_id = (select id from public.events where title = 'Allenamento C1')$$, 'event_needs_group');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000003');
select test.rows('player in C1 no longer sees the event', 'select * from public.events', 0);
select test.logout();

\echo == answering
-- A finished training, made directly so the answer rule for past events can be tested.
insert into public.events (id, type, title, starts_at, ends_at)
  values ('00000000-0000-0000-0000-00000000ee01', 'training', 'Passato', now() - interval '2 days', now() - interval '2 days' + interval '1 hour');
insert into public.event_groups values ('00000000-0000-0000-0000-00000000ee01', (select id from public.groups where code = 'A'));
select test.login('00000000-0000-0000-0000-000000000001');
select test.works('player answers present', $$select public.answer_attendance((select id from public.events where title = 'Allenamento A'), 'present')$$);
select test.works('player changes the answer', $$select public.answer_attendance((select id from public.events where title = 'Allenamento A'), 'absent')$$);
select test.rows('a changed answer is still one row', $$select * from public.attendance_answers where answer = 'absent'$$, 1);
select test.fails('no answer after the event is over', $$select public.answer_attendance('00000000-0000-0000-0000-00000000ee01', 'present')$$, 'event_over');
select test.fails('player cannot write an answer directly', $$insert into public.attendance_answers (event_id, user_id, answer) values ('00000000-0000-0000-0000-00000000ee01', auth.uid(), 'present')$$, 'permission denied');
select test.fails('player cannot edit an answer directly', $$update public.attendance_answers set answer = 'present'$$, 'permission denied');
select test.fails('an unknown event is refused', $$select public.answer_attendance(gen_random_uuid(), 'present')$$, 'forbidden');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000002');
select test.works('second player answers present', $$select public.answer_attendance((select id from public.events where title = 'Allenamento A'), 'present')$$);
select test.rows('a player sees only their own answers', 'select * from public.attendance_answers', 1);
select test.logout();
select test.login('00000000-0000-0000-0000-000000000003');
select test.fails('player outside the groups cannot answer', $$select public.answer_attendance((select id from public.events where title = 'Allenamento A' limit 1), 'present')$$, 'forbidden');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000d1');
select test.fails('account without profile cannot answer', $$select public.answer_attendance('00000000-0000-0000-0000-00000000ee01', 'present')$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot answer', $$select public.answer_attendance('00000000-0000-0000-0000-00000000ee01', 'present')$$, 'permission denied');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.rows('coach sees every answer', 'select * from public.attendance_answers', 2);
select test.logout();

\echo == staff view of attendance
select test.login('00000000-0000-0000-0000-000000000001');
select test.fails('player cannot open the staff view', $$select * from public.event_attendance((select id from public.events where title = 'Allenamento A'))$$, 'forbidden');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.rows('staff view lists everyone in the event groups', $$select * from public.event_attendance((select id from public.events where title = 'Allenamento A'))$$, 2);
select test.rows('staff view shows who has not answered', $$select * from public.event_attendance((select id from public.events where title = 'Giovedì' order by starts_at limit 1)) where answer is null$$, 2);
select test.rows('staff view shows who answered absent', $$select * from public.event_attendance((select id from public.events where title = 'Allenamento A')) where answer = 'absent'$$, 1);
select test.logout();

\echo == recorded attendance
select test.login('00000000-0000-0000-0000-000000000001');
select test.fails('player cannot record attendance', $$insert into public.attendance_records (event_id, user_id, status) values ('00000000-0000-0000-0000-00000000ee01', auth.uid(), 'on_time')$$, 'row-level security');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.works('coach records a status', $$insert into public.attendance_records (event_id, user_id, status) values ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-000000000001', 'late')$$);
select test.works('coach records another status', $$insert into public.attendance_records (event_id, user_id, status) values ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-000000000002', 'injured')$$);
select test.fails('one record per person and event', $$insert into public.attendance_records (event_id, user_id, status) values ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-000000000002', 'late')$$, 'duplicate key');
select test.affected('coach corrects a status', $$update public.attendance_records set status = 'excused' where user_id = '00000000-0000-0000-0000-000000000002'$$, 1);
select test.rows('staff view shows the recorded status', $$select * from public.event_attendance('00000000-0000-0000-0000-00000000ee01') where status = 'excused'$$, 1);
select test.logout();
select test.login('00000000-0000-0000-0000-000000000001');
select test.rows('player sees only their own record', 'select * from public.attendance_records', 1);
select test.affected('player cannot change a record', $$update public.attendance_records set status = 'on_time'$$, 0);
select test.affected('player cannot delete a record', $$delete from public.attendance_records$$, 0);
select test.logout();

\echo == removing things
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.affected('coach removes a whole event with its answers and records', $$delete from public.events where title = 'Allenamento A'$$, 1);
select test.rows('answers of a removed event are gone', 'select * from public.attendance_answers', 0);
select test.affected('coach removes the rest of a series', $$delete from public.events where title = 'Giovedì' and starts_at >= timestamptz '2026-10-29 00:00 Europe/Rome'$$, 6);
select test.rows('the first event of the series remains', $$select * from public.events where title = 'Giovedì'$$, 1);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.fails('board cannot remove a member row directly (migration 0050)', $$delete from public.profiles where id = '00000000-0000-0000-0000-000000000001'$$, 'permission denied');
select test.rows('the member is still there', $$select * from public.profiles where id = '00000000-0000-0000-0000-000000000001'$$, 1);
select test.logout();

rollback;
\echo ALL EVENT TESTS PASSED
