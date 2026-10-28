begin;

-- People: coach1, board1, p1 in A, p2 in B, p3 in A and B, p4 in C1.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000003', 'Pau', 'Three'),
  ('00000000-0000-0000-0000-000000000004', 'Pit', 'Four');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('B', '00000000-0000-0000-0000-000000000002'),
    ('A', '00000000-0000-0000-0000-000000000003'),
    ('B', '00000000-0000-0000-0000-000000000003'),
    ('C1', '00000000-0000-0000-0000-000000000004')) v(code, uid)
  join public.groups g on g.code = v.code;

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.day(n integer) returns date language sql as $$ select (now() at time zone 'Europe/Rome')::date + n $$;
create function pg_temp.mk(p_id text, p_day integer, p_group text, p_series uuid default null, p_league integer default null) returns void
language plpgsql as $$
declare v_start timestamptz := (pg_temp.day(p_day) + time '12:00') at time zone 'Europe/Rome';
begin
  insert into public.events (id, series_id, type, title, starts_at, ends_at, league_match_id)
    values (pg_temp.u(p_id), p_series, case when p_league is null then 'training' else 'game' end::public.event_type,
            p_id, v_start, v_start + interval '1 hour', p_league);
  insert into public.event_groups select pg_temp.u(p_id), id from public.groups where code = p_group;
end $$;
create temp table s as select '00000000-0000-0000-0000-0000000005e1'::uuid as id;
grant select on s to authenticated;
select pg_temp.mk('e0', -7, 'A', (select id from s));
select pg_temp.mk('e1', 3, 'A', (select id from s));
select pg_temp.mk('e2', 10, 'A', (select id from s));
select pg_temp.mk('e3', 17, 'A', (select id from s));
select pg_temp.mk('e4', 5, 'A', null, 77);
select pg_temp.mk('e5', 6, 'A');
insert into public.attendance_answers (event_id, user_id, answer) values
  (pg_temp.u('e1'), pg_temp.u('1'), 'present'),
  (pg_temp.u('e1'), pg_temp.u('3'), 'present'),
  (pg_temp.u('e0'), pg_temp.u('1'), 'present');
insert into public.attendance_records (event_id, user_id, status) values
  (pg_temp.u('e1'), pg_temp.u('1'), 'on_time');
insert into public.absence_periods (user_id, starts_on, ends_on) values (pg_temp.u('2'), pg_temp.day(16), pg_temp.day(18));

\echo == who can do it
select test.login(pg_temp.u('1'));
select test.fails('a player cannot change groups', $$select public.set_event_groups(pg_temp.u('e1'), (select array_agg(id) from public.groups where code = 'B')::smallint[], 'one')$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot change groups', $$select public.set_event_groups(pg_temp.u('e1'), array[1]::smallint[], 'one')$$, 'permission denied');
select test.logout();

\echo == one event
select test.login(pg_temp.u('c1'));
select test.rows('a coach adds B to one event', $$select 1 from (select public.set_event_groups(pg_temp.u('e1'), (select array_agg(id) from public.groups where code in ('A', 'B'))::smallint[], 'one') n) x where n = 1$$, 1);
select test.rows('that event now has two groups', $$select 1 from public.event_groups where event_id = pg_temp.u('e1')$$, 2);
select test.rows('the next one is untouched', $$select 1 from public.event_groups where event_id = pg_temp.u('e2')$$, 1);
select test.logout();
select test.login(pg_temp.u('2'));
select test.rows('a member of the added group now sees the event', $$select 1 from public.events where id = pg_temp.u('e1')$$, 1);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('removing A takes away answers of people only in A', $$select 1 from (select public.set_event_groups(pg_temp.u('e1'), (select array_agg(id) from public.groups where code = 'B')::smallint[], 'one') n) x where n = 1$$, 1);
select test.rows('the answer of the person only in A is gone', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e1') and user_id = pg_temp.u('1')$$, 0);
select test.rows('the record of the person only in A is gone', $$select 1 from public.attendance_records where event_id = pg_temp.u('e1') and user_id = pg_temp.u('1')$$, 0);
select test.rows('the answer of a person still in a group stays', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e1') and user_id = pg_temp.u('3')$$, 1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('the removed group no longer sees the event', $$select 1 from public.events where id = pg_temp.u('e1')$$, 0);
select test.logout();

\echo == the rest of the series
select test.login(pg_temp.u('c1'));
select test.rows('following changes this event and the later ones', $$select 1 from (select public.set_event_groups(pg_temp.u('e2'), (select array_agg(id) from public.groups where code in ('A', 'B'))::smallint[], 'following') n) x where n = 2$$, 1);
select test.rows('the later ones have the new groups', $$select 1 from public.event_groups where event_id in (pg_temp.u('e2'), pg_temp.u('e3')) and group_id = (select id from public.groups where code = 'B')$$, 2);
select test.rows('an earlier one is untouched', $$select 1 from public.event_groups where event_id = pg_temp.u('e1')$$, 1);
select test.rows('a finished one is untouched', $$select 1 from public.event_groups where event_id = pg_temp.u('e0')$$, 1);
select test.rows('an event of another series is untouched', $$select 1 from public.event_groups where event_id = pg_temp.u('e5')$$, 1);
select test.rows('an absence period applies to the added group', $$select 1 from public.attendance_answers where event_id = pg_temp.u('e3') and user_id = pg_temp.u('2') and answer = 'absent' and from_period is not null$$, 1);
select test.rows('the same list again changes nothing and still counts', $$select 1 from (select public.set_event_groups(pg_temp.u('e2'), (select array_agg(id) from public.groups where code in ('A', 'B'))::smallint[], 'following') n) x where n = 2$$, 1);
select test.rows('an event outside a series: following changes just itself', $$select 1 from (select public.set_event_groups(pg_temp.u('e5'), (select array_agg(id) from public.groups where code = 'C1')::smallint[], 'following') n) x where n = 1$$, 1);
select test.logout();

\echo == what is refused
select test.login(pg_temp.u('c1'));
select test.fails('no groups', $$select public.set_event_groups(pg_temp.u('e2'), array[]::smallint[], 'one')$$, 'groups_required');
select test.fails('a group that does not exist', $$select public.set_event_groups(pg_temp.u('e2'), array[99]::smallint[], 'one')$$, 'groups_required');
select test.fails('a scope that does not exist', $$select public.set_event_groups(pg_temp.u('e2'), array[1]::smallint[], 'all')$$, 'scope_invalid');
select test.fails('an event that does not exist', $$select public.set_event_groups(pg_temp.u('ff'), array[1]::smallint[], 'one')$$, 'not_found');
select test.fails('a league game keeps its groups', $$select public.set_event_groups(pg_temp.u('e4'), (select array_agg(id) from public.groups where code = 'B')::smallint[], 'one')$$, 'league_event');
select test.fails('a finished event cannot change', $$select public.set_event_groups(pg_temp.u('e0'), (select array_agg(id) from public.groups where code = 'B')::smallint[], 'one')$$, 'event_ended');
select test.logout();
select test.login(pg_temp.u('b1'));
select test.rows('the board can do it too', $$select 1 from (select public.set_event_groups(pg_temp.u('e5'), (select array_agg(id) from public.groups where code = 'A')::smallint[], 'one') n) x where n = 1$$, 1);
select test.logout();
