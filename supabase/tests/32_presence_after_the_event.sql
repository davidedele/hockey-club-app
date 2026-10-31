begin;

-- People: p1, p2, p3 in A, p9 in B only. c1 is a coach.
insert into auth.users (id, email, email_confirmed_at)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'p' || n || '@example.test', now() from generate_series(1, 3) n;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000009', 'p9@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now());
insert into public.profiles (id, first_name, last_name)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'Nome' || chr(64 + n), 'Cognome' || chr(64 + n) from generate_series(1, 3) n;
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-000000000009', 'Nome', 'Esterno'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, ('00000000-0000-0000-0000-00000000000' || n)::uuid from public.groups g, generate_series(1, 3) n where g.code = 'A';
insert into public.group_members (group_id, user_id)
  select g.id, '00000000-0000-0000-0000-000000000009'::uuid from public.groups g where g.code = 'B';

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;

-- Four finished trainings and one that has not started, all for A.
insert into public.events (id, type, title, starts_at, ends_at) values
  (pg_temp.u('d1'), 'training', 'finished, nothing recorded', now() - interval '5 days', now() - interval '5 days' + interval '1 hour'),
  (pg_temp.u('d2'), 'training', 'finished, recorded', now() - interval '4 days', now() - interval '4 days' + interval '1 hour'),
  (pg_temp.u('d3'), 'training', 'finished, only a call up decision', now() - interval '3 days', now() - interval '3 days' + interval '1 hour'),
  (pg_temp.u('d4'), 'training', 'finished, half recorded', now() - interval '2 days', now() - interval '2 days' + interval '1 hour'),
  (pg_temp.u('f1'), 'training', 'not started', now() + interval '2 days', now() + interval '2 days 1 hour');
insert into public.event_groups select e, g.id
  from (values (pg_temp.u('d1')), (pg_temp.u('d2')), (pg_temp.u('d3')), (pg_temp.u('d4')), (pg_temp.u('f1'))) v(e), public.groups g where g.code = 'A';

-- d1: p1 answered present, nobody recorded.
insert into public.attendance_answers values (pg_temp.u('d1'), pg_temp.u('1'), 'present', now(), null);
-- d2: nobody answered. The staff recorded p1 on time, p2 late and p3 excused.
insert into public.attendance_records values
  (pg_temp.u('d2'), pg_temp.u('1'), 'on_time'), (pg_temp.u('d2'), pg_temp.u('2'), 'late'), (pg_temp.u('d2'), pg_temp.u('3'), 'excused');
-- d3: p1 and p2 answered present, p2 was marked not called up and nothing else was recorded.
insert into public.attendance_answers values (pg_temp.u('d3'), pg_temp.u('1'), 'present', now(), null), (pg_temp.u('d3'), pg_temp.u('2'), 'present', now(), null);
insert into public.attendance_records values (pg_temp.u('d3'), pg_temp.u('2'), 'not_called_up');
-- d4: p1 and p2 answered present, the staff recorded only p1 (on time).
insert into public.attendance_answers values (pg_temp.u('d4'), pg_temp.u('1'), 'present', now(), null), (pg_temp.u('d4'), pg_temp.u('2'), 'present', now(), null);
insert into public.attendance_records values (pg_temp.u('d4'), pg_temp.u('1'), 'on_time');
-- f1: p2 answered present and the staff already recorded p1 as on time.
insert into public.attendance_answers values (pg_temp.u('f1'), pg_temp.u('2'), 'present', now(), null);
insert into public.attendance_records values (pg_temp.u('f1'), pg_temp.u('1'), 'on_time');

\echo == recorded or not
select test.login(pg_temp.u('1'));
select test.rows('finished and nothing recorded: not recorded', $$select 1 where public.event_presence_recorded(pg_temp.u('d1'))$$, 0);
select test.rows('finished and recorded: recorded', $$select 1 where public.event_presence_recorded(pg_temp.u('d2'))$$, 1);
select test.rows('only a not called up decision does not count as recorded', $$select 1 where public.event_presence_recorded(pg_temp.u('d3'))$$, 0);
select test.rows('not finished: never recorded, even with a status', $$select 1 where public.event_presence_recorded(pg_temp.u('f1'))$$, 0);
select test.logout();

\echo == present counts
select test.login(pg_temp.u('1'));
select test.rows('finished, nothing recorded: the answers are counted', $$select 1 from public.event_present_counts(array[pg_temp.u('d1')]) where present = 1$$, 1);
select test.rows('finished and recorded: on time and late are counted, not excused and not answers', $$select 1 from public.event_present_counts(array[pg_temp.u('d2')]) where present = 2$$, 1);
select test.rows('finished, only a call up decision: the answers are counted without the person not called up', $$select 1 from public.event_present_counts(array[pg_temp.u('d3')]) where present = 1$$, 1);
select test.rows('finished and half recorded: only the recorded person counts, the answer of the other does not', $$select 1 from public.event_present_counts(array[pg_temp.u('d4')]) where present = 1$$, 1);
select test.rows('not finished: the answers count, a recorded status does not', $$select 1 from public.event_present_counts(array[pg_temp.u('f1')]) where present = 1$$, 1);
select test.logout();

\echo == present names
select test.login(pg_temp.u('1'));
select test.rows('recorded: the names are the people on time or late', $$select 1 from public.event_present_people(pg_temp.u('d2')) where user_id in (pg_temp.u('1'), pg_temp.u('2'))$$, 2);
select test.rows('recorded: a person recorded as excused is not named', $$select 1 from public.event_present_people(pg_temp.u('d2')) where user_id = pg_temp.u('3')$$, 0);
select test.rows('half recorded: the person who only answered is not named', $$select 1 from public.event_present_people(pg_temp.u('d4')) where user_id = pg_temp.u('2')$$, 0);
select test.rows('nothing recorded: the person who answered present is named', $$select 1 from public.event_present_people(pg_temp.u('d1')) where user_id = pg_temp.u('1')$$, 1);
select test.rows('a person not called up is not named even when others were not recorded', $$select 1 from public.event_present_people(pg_temp.u('d3')) where user_id = pg_temp.u('2')$$, 0);
select test.rows('not finished: the answer is named', $$select 1 from public.event_present_people(pg_temp.u('f1')) where user_id = pg_temp.u('2')$$, 1);
select test.rows('not finished: a recorded status alone does not name anyone', $$select 1 from public.event_present_people(pg_temp.u('f1')) where user_id = pg_temp.u('1')$$, 0);
select test.logout();

\echo == who may ask
select test.login(pg_temp.u('9'));
select test.rows('a person of another group sees no names', $$select 1 from public.event_present_people(pg_temp.u('d2'))$$, 0);
select test.rows('a person of another group sees no counts', $$select 1 from public.event_present_counts(array[pg_temp.u('d2')])$$, 0);
select test.rows('a person of another group learns nothing about the recording', $$select 1 where public.event_presence_recorded(pg_temp.u('d2'))$$, 0);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('staff see the same names as the players', $$select 1 from public.event_present_people(pg_temp.u('d2'))$$, 2);
select test.logout();
select test.login_anon();
select test.fails('a visitor cannot ask whether presence was recorded', $$select public.event_presence_recorded(pg_temp.u('d2'))$$, 'permission denied');
select test.logout();

rollback;
