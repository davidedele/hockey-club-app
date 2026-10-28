begin;

-- People: board1 and coach1 with no group. In A: p1, p3, p5, p6, p7, p8. In B: p2 and p3. In C1: p4.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.test', now()),
  ('00000000-0000-0000-0000-000000000005', 'p5@example.test', now()),
  ('00000000-0000-0000-0000-000000000006', 'p6@example.test', now()),
  ('00000000-0000-0000-0000-000000000007', 'p7@example.test', now()),
  ('00000000-0000-0000-0000-000000000008', 'p8@example.test', now());
insert into public.profiles (id, first_name, last_name, position) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board', null),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach', null),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One', 'forward'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two', 'forward'),
  ('00000000-0000-0000-0000-000000000003', 'Pau', 'Three', 'defence'),
  ('00000000-0000-0000-0000-000000000004', 'Pit', 'Four', 'goalie'),
  ('00000000-0000-0000-0000-000000000005', 'Pim', 'Five', 'forward'),
  ('00000000-0000-0000-0000-000000000006', 'Pol', 'Six', 'goalie'),
  ('00000000-0000-0000-0000-000000000007', 'Pru', 'Seven', 'forward'),
  ('00000000-0000-0000-0000-000000000008', 'Pey', 'Eight', 'defence');
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
    ('A', '00000000-0000-0000-0000-000000000005'),
    ('A', '00000000-0000-0000-0000-000000000006'),
    ('A', '00000000-0000-0000-0000-000000000007'),
    ('A', '00000000-0000-0000-0000-000000000008')) v(code, uid)
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

-- e1 and e3 are to come, e2 is cancelled, e0 is over.
select pg_temp.mk('e1', 48, array['A']);
select pg_temp.mk('e2', 72, array['A']);
select pg_temp.mk('e3', 96, array['A', 'B']);
select pg_temp.mk('e0', -48, array['A']);
update public.events set cancelled_at = now() where id = pg_temp.u('e2');
insert into public.attendance_answers (event_id, user_id, answer) values
  (pg_temp.u('e1'), pg_temp.u('1'), 'present'),
  (pg_temp.u('e1'), pg_temp.u('5'), 'absent');

\echo == who may write a line-up
select test.login(pg_temp.u('1'));
select test.fails('a player cannot set a place', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'centre', 1, pg_temp.u('1'))$$, 'row-level security');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot set a place', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'centre', 1, pg_temp.u('1'))$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.works('a coach sets a centre', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'centre', 1, pg_temp.u('1'))$$);
select test.works('a coach sets a goalie', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'goalie', 1, pg_temp.u('6'))$$);
select test.rows('the coach is written down as the one who set it', $$select 1 from public.event_lineup where event_id = pg_temp.u('e1') and set_by = pg_temp.u('c1')$$, 2);
select test.logout();
select test.login(pg_temp.u('b1'));
select test.works('the board can set a place too', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'left_defence', 1, pg_temp.u('3'))$$);
select test.logout();

\echo == one player, one place
select test.login(pg_temp.u('c1'));
select test.fails('the same player cannot hold two places', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'right_wing', 1, pg_temp.u('1'))$$, 'event_lineup_event_id_user_id_key');
select test.fails('two players cannot hold the same place', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'centre', 1, pg_temp.u('5'))$$, 'event_lineup_pkey');
select test.works('the same player can hold a place in another event', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e3'), 'centre', 1, pg_temp.u('1'))$$);
select test.logout();

\echo == how many lines, pairs and goalies there are
select test.login(pg_temp.u('c1'));
select test.works('a fourth forward line is allowed', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'left_wing', 4, pg_temp.u('5'))$$);
select test.fails('a fifth forward line is not', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'left_wing', 5, pg_temp.u('7'))$$, 'event_lineup_unit_range');
select test.works('a third defence pair is allowed', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e3'), 'right_defence', 3, pg_temp.u('3'))$$);
select test.fails('a fourth defence pair is not', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'right_defence', 4, pg_temp.u('7'))$$, 'event_lineup_unit_range');
select test.fails('a third goalie is not', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'goalie', 3, pg_temp.u('7'))$$, 'event_lineup_unit_range');
select test.fails('a place numbered zero is not', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'centre', 0, pg_temp.u('7'))$$, 'event_lineup_unit_range');
select test.logout();

\echo == only people the event is for
select test.login(pg_temp.u('c1'));
select test.fails('somebody outside the groups of the event', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e1'), 'right_wing', 1, pg_temp.u('2'))$$, 'player_not_in_event');
select test.works('somebody in a second group of the event', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e3'), 'right_wing', 1, pg_temp.u('2'))$$);
select test.fails('a place cannot be moved to somebody outside the groups', $$update public.event_lineup set user_id = pg_temp.u('2') where event_id = pg_temp.u('e1') and slot = 'centre' and unit = 1$$, 'player_not_in_event');
select test.logout();

\echo == a line-up is a plan
select test.login(pg_temp.u('c1'));
select test.fails('no line-up for a cancelled event', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e2'), 'centre', 1, pg_temp.u('1'))$$, 'event_cancelled');
select test.fails('no line-up for an event that is over', $$insert into public.event_lineup (event_id, slot, unit, user_id) values (pg_temp.u('e0'), 'centre', 1, pg_temp.u('1'))$$, 'event_ended');
select test.logout();

\echo == who may read a line-up
select test.login(pg_temp.u('1'));
select test.rows('a player of the group reads the line-up', $$select 1 from public.event_lineup where event_id = pg_temp.u('e1')$$, 4);
select test.affected('a player cannot clear a place', $$delete from public.event_lineup where event_id = pg_temp.u('e1') and slot = 'centre'$$, 0);
select test.affected('a player cannot move a place', $$update public.event_lineup set user_id = pg_temp.u('1') where event_id = pg_temp.u('e1') and slot = 'goalie'$$, 0);
select test.logout();
select test.login(pg_temp.u('4'));
select test.rows('somebody outside the groups reads nothing', $$select 1 from public.event_lineup where event_id = pg_temp.u('e1')$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous reads nothing', $$select 1 from public.event_lineup$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('staff read the line-up of every event', $$select 1 from public.event_lineup$$, 7);
select test.logout();

\echo == who the coach can pick
select test.login(pg_temp.u('c1'));
select test.rows('the people of the one group of the event', $$select 1 from public.lineup_candidates(pg_temp.u('e1'))$$, 6);
select test.rows('the people of both groups, each once', $$select 1 from public.lineup_candidates(pg_temp.u('e3'))$$, 7);
select test.rows('the answers come with them', $$select 1 from public.lineup_candidates(pg_temp.u('e1')) where answer = 'present'$$, 1);
select test.rows('somebody who has not answered is still on the list', $$select 1 from public.lineup_candidates(pg_temp.u('e1')) where answer is null$$, 4);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('a player cannot ask who could be picked', $$select 1 from public.lineup_candidates(pg_temp.u('e1'))$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot ask who could be picked', $$select 1 from public.lineup_candidates(pg_temp.u('e1'))$$, 'permission denied');
select test.logout();

\echo == one tap sets a place
select test.login(pg_temp.u('1'));
select test.fails('a player cannot set a place with one tap', $$select public.set_lineup_place(pg_temp.u('e1'), 'right_wing', 1, pg_temp.u('7'))$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot set a place with one tap', $$select public.set_lineup_place(pg_temp.u('e1'), 'right_wing', 1, pg_temp.u('7'))$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.works('a coach fills an empty place', $$select public.set_lineup_place(pg_temp.u('e1'), 'right_wing', 1, pg_temp.u('7'))$$);
select test.works('putting somebody else there replaces the first', $$select public.set_lineup_place(pg_temp.u('e1'), 'right_wing', 1, pg_temp.u('8'))$$);
select test.rows('the one who was replaced has no place', $$select 1 from public.event_lineup where event_id = pg_temp.u('e1') and user_id = pg_temp.u('7')$$, 0);
select test.rows('the line-up did not grow', $$select 1 from public.event_lineup where event_id = pg_temp.u('e1')$$, 5);
select test.works('moving a player to another place', $$select public.set_lineup_place(pg_temp.u('e1'), 'centre', 2, pg_temp.u('8'))$$);
select test.rows('the place they left is empty', $$select 1 from public.event_lineup where event_id = pg_temp.u('e1') and slot = 'right_wing' and unit = 1$$, 0);
select test.rows('they are in the new place, once', $$select 1 from public.event_lineup where event_id = pg_temp.u('e1') and user_id = pg_temp.u('8')$$, 1);
select test.works('passing nobody empties the place', $$select public.set_lineup_place(pg_temp.u('e1'), 'centre', 2, null)$$);
select test.rows('the line-up is back to what it was', $$select 1 from public.event_lineup where event_id = pg_temp.u('e1')$$, 4);
select test.fails('one tap cannot pick somebody outside the groups', $$select public.set_lineup_place(pg_temp.u('e1'), 'right_wing', 1, pg_temp.u('2'))$$, 'player_not_in_event');
select test.fails('one tap cannot touch a cancelled event', $$select public.set_lineup_place(pg_temp.u('e2'), 'centre', 1, pg_temp.u('1'))$$, 'event_cancelled');
select test.fails('one tap cannot touch an event that is over', $$select public.set_lineup_place(pg_temp.u('e0'), 'centre', 1, pg_temp.u('1'))$$, 'event_ended');
select test.rows('a refused tap changed nothing', $$select 1 from public.event_lineup where event_id = pg_temp.u('e1')$$, 4);
select test.logout();

\echo == clearing places
select test.login(pg_temp.u('c1'));
select test.affected('a coach clears one place', $$delete from public.event_lineup where event_id = pg_temp.u('e1') and slot = 'left_wing' and unit = 4$$, 1);
select test.affected('a coach clears the whole line-up', $$delete from public.event_lineup where event_id = pg_temp.u('e1')$$, 3);
select test.logout();

\echo == the line-up follows the event and the people
select test.login(pg_temp.u('c1'));
select test.rows('taking a group off clears the places of its people only', $$select 1 from (select public.set_event_groups(pg_temp.u('e3'), (select array_agg(id) from public.groups where code = 'A')::smallint[], 'one') n) x where n = 1$$, 1);
select test.rows('the place of the person only in the removed group is gone', $$select 1 from public.event_lineup where event_id = pg_temp.u('e3') and user_id = pg_temp.u('2')$$, 0);
select test.rows('the places of the others stay', $$select 1 from public.event_lineup where event_id = pg_temp.u('e3')$$, 2);
select test.logout();
-- Once the event is over its line-up is kept, and a member who leaves can still be removed.
update public.events set starts_at = now() - interval '3 hours', ends_at = now() - interval '2 hours' where id = pg_temp.u('e3');
select test.works('a member with a place in a past event can leave', $$delete from public.profiles where id = pg_temp.u('3')$$);
select test.login(pg_temp.u('c1'));
select test.rows('their place went with them', $$select 1 from public.event_lineup where user_id = pg_temp.u('3')$$, 0);
select test.rows('the line-up of the past event is still there', $$select 1 from public.event_lineup where event_id = pg_temp.u('e3')$$, 1);
select test.logout();
delete from public.events where id = pg_temp.u('e3');
select test.login(pg_temp.u('c1'));
select test.rows('a deleted event takes its line-up with it', $$select 1 from public.event_lineup$$, 0);
select test.logout();
