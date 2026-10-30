begin;

-- People: board1 and coach1 with no group. In A: p1, p5. In B: p2 and p3. In C1: p4.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.test', now()),
  ('00000000-0000-0000-0000-000000000005', 'p5@example.test', now());
insert into public.profiles (id, first_name, last_name, position) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board', null),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach', null),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One', 'forward'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two', 'forward'),
  ('00000000-0000-0000-0000-000000000003', 'Pau', 'Three', 'defence'),
  ('00000000-0000-0000-0000-000000000004', 'Pit', 'Four', 'goalie'),
  ('00000000-0000-0000-0000-000000000005', 'Pim', 'Five', 'forward');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('B', '00000000-0000-0000-0000-000000000002'),
    ('A', '00000000-0000-0000-0000-000000000003'),
    ('B', '00000000-0000-0000-0000-000000000003'),
    ('C1', '00000000-0000-0000-0000-000000000004'),
    ('A', '00000000-0000-0000-0000-000000000005')) v(code, uid)
  join public.groups g on g.code = v.code;

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.mk(p_id text, p_hours integer, p_groups text[]) returns void
language plpgsql as $$
declare v_start timestamptz := now() + (p_hours || ' hours')::interval;
begin
  insert into public.events (id, type, title, starts_at, ends_at)
    values (pg_temp.u(p_id), 'training', p_id, v_start, v_start + interval '1 hour');
  insert into public.event_groups select pg_temp.u(p_id), id from public.groups where code = any (p_groups);
end $$;

-- e1 is to come (A), e2 is cancelled (A), e3 is to come (A and B), e0 is over (A).
select pg_temp.mk('e1', 48, array['A']);
select pg_temp.mk('e2', 72, array['A']);
select pg_temp.mk('e3', 96, array['A', 'B']);
select pg_temp.mk('e0', -48, array['A']);
update public.events set cancelled_at = now() where id = pg_temp.u('e2');
insert into public.attendance_answers (event_id, user_id, answer) values
  (pg_temp.u('e1'), pg_temp.u('1'), 'present'),
  (pg_temp.u('e1'), pg_temp.u('5'), 'absent');
insert into public.attendance_records (event_id, user_id, status) values
  (pg_temp.u('e0'), pg_temp.u('1'), 'on_time');

\echo == who may change a state
select test.login(pg_temp.u('1'));
select test.fails('a player cannot change a state', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('5'), 'present')$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot change a state', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('5'), 'present')$$, 'permission denied');
select test.logout();

\echo == what a coach can do
select test.login(pg_temp.u('c1'));
select test.works('a coach sets a person present', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('5'), 'present')$$);
select test.rows('the answer is now present', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e1') and user_id = pg_temp.u('5') and answer = 'present'$$, 1);
select test.rows('present is counted', $$select 1 from public.event_present_counts(array[pg_temp.u('e1')]) where present = 2$$, 1);
select test.works('a coach sets a person absent', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('5'), 'absent')$$);
select test.rows('the answer is now absent', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e1') and user_id = pg_temp.u('5') and answer = 'absent'$$, 1);
select test.works('a coach sets a person waiting', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('1'), 'waiting')$$);
select test.rows('waiting removes the answer', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e1') and user_id = pg_temp.u('1')$$, 0);
select test.works('waiting for someone with no answer is fine', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('1'), 'waiting')$$);
select test.works('a coach gives an answer to someone who had none', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('1'), 'present')$$);
select test.rows('the new answer exists', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e1') and user_id = pg_temp.u('1') and answer = 'present'$$, 1);

\echo == not called up
select test.works('a coach marks a person not called up', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('5'), 'not_called_up')$$);
select test.rows('the record exists', $$select 1 from public.attendance_records where event_id = pg_temp.u('e1') and user_id = pg_temp.u('5') and status = 'not_called_up'$$, 1);
select test.rows('the answer is kept', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e1') and user_id = pg_temp.u('5')$$, 1);
select test.works('marking again changes nothing', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('5'), 'not_called_up')$$);
select test.rows('still one record', $$select 1 from public.attendance_records where event_id = pg_temp.u('e1') and user_id = pg_temp.u('5')$$, 1);
select test.works('a coach calls the person up again as present', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('5'), 'present')$$);
select test.rows('the not called up record is gone', $$select 1 from public.attendance_records where event_id = pg_temp.u('e1') and user_id = pg_temp.u('5')$$, 0);
select test.works('a coach marks a person not called up and then waiting', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('5'), 'not_called_up')$$);
select test.works('waiting calls the person up with no answer', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('5'), 'waiting')$$);
select test.rows('no record and no answer', $$select 1 from (select 1 from public.attendance_records where event_id = pg_temp.u('e1') and user_id = pg_temp.u('5') union all select 1 from public.attendance_answers where event_id = pg_temp.u('e1') and user_id = pg_temp.u('5')) x$$, 0);

\echo == a record of who came is not lost by changing the answer
select test.works('a coach changes the answer of someone recorded on time', $$select public.set_player_state(pg_temp.u('e0'), pg_temp.u('1'), 'absent')$$);
select test.rows('the recorded status stays', $$select 1 from public.attendance_records where event_id = pg_temp.u('e0') and user_id = pg_temp.u('1') and status = 'on_time'$$, 1);
select test.rows('a finished event can be changed', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e0') and user_id = pg_temp.u('1') and answer = 'absent'$$, 1);

select test.works('marking a recorded person not called up', $$select public.set_player_state(pg_temp.u('e0'), pg_temp.u('1'), 'not_called_up')$$);
select test.rows('the recorded status is replaced', $$select 1 from public.attendance_records where event_id = pg_temp.u('e0') and user_id = pg_temp.u('1') and status = 'not_called_up'$$, 1);

\echo == what is refused
select test.fails('someone outside the groups of the event', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('4'), 'present')$$, 'not_in_event');
select test.fails('someone in the other group of a two group event is fine only if in a group', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('2'), 'present')$$, 'not_in_event');
select test.works('a person of the second group of an event', $$select public.set_player_state(pg_temp.u('e3'), pg_temp.u('2'), 'present')$$);
select test.fails('a cancelled event', $$select public.set_player_state(pg_temp.u('e2'), pg_temp.u('1'), 'present')$$, 'event_cancelled');
select test.fails('an unknown event', $$select public.set_player_state(pg_temp.u('99'), pg_temp.u('1'), 'present')$$, 'forbidden');
select test.fails('an unknown state', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('1'), 'late')$$, 'invalid_state');
select test.fails('no state', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('1'), null)$$, 'invalid_state');
select test.logout();

\echo == the board can too
select test.login(pg_temp.u('b1'));
select test.works('the board sets a person absent', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('1'), 'absent')$$);
select test.logout();

\echo == an answer from an absence period becomes the answer given by staff
insert into public.absence_periods (id, user_id, starts_on, ends_on) values
  ('11111111-1111-1111-1111-111111111111', pg_temp.u('3'), current_date, current_date + 10);
insert into public.attendance_answers (event_id, user_id, answer, from_period) values
  (pg_temp.u('e3'), pg_temp.u('3'), 'absent', '11111111-1111-1111-1111-111111111111');
select test.login(pg_temp.u('c1'));
select test.works('a coach overrides an answer from a period', $$select public.set_player_state(pg_temp.u('e3'), pg_temp.u('3'), 'present')$$);
select test.logout();
select test.rows('the answer no longer belongs to the period', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e3') and user_id = pg_temp.u('3') and answer = 'present' and from_period is null$$, 1);

rollback;
