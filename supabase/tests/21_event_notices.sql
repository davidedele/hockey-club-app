begin;

-- People: coach1 and p1, p2, p4, p5 in A, p3 in B. p4 switched the club emails off.
insert into auth.users (id, email, email_confirmed_at)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'p' || n || '@example.test', now() from generate_series(1, 5) n;
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now());
insert into public.profiles (id, first_name, last_name)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'Nome' || n, 'Cognome' || n from generate_series(1, 5) n;
insert into public.profiles (id, first_name, last_name) values ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach');
insert into public.profile_contacts (user_id, email) select id, id::text || '@example.test' from public.profiles;
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('A', '00000000-0000-0000-0000-000000000002'),
    ('B', '00000000-0000-0000-0000-000000000003'),
    ('A', '00000000-0000-0000-0000-000000000004'),
    ('A', '00000000-0000-0000-0000-000000000005'),
    ('A', '00000000-0000-0000-0000-0000000000c1')) v(code, uid)
  join public.groups g on g.code = v.code;
insert into public.reminder_prefs (user_id, enabled) values ('00000000-0000-0000-0000-000000000004', false);

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create temp table base as select ((now() at time zone 'Europe/Rome')::date + time '12:00') at time zone 'Europe/Rome' as t;
grant select on base to service_role;
grant usage on schema test to service_role;
create function pg_temp.mk(p_id text, p_group text, p_offset interval) returns void
language plpgsql as $$
declare v_start timestamptz := (select t from base) + p_offset;
begin
  insert into public.events (id, type, title, starts_at, ends_at)
    values (pg_temp.u(p_id), 'training', p_id, v_start, v_start + interval '1 hour');
  insert into public.event_groups select pg_temp.u(p_id), id from public.groups where code = p_group;
end $$;
select pg_temp.mk('e1', 'A', interval '2 days');
select pg_temp.mk('e2', 'B', interval '2 days');
select pg_temp.mk('e3', 'A', interval '2 days');
select pg_temp.mk('e4', 'A', interval '-1 day');
select pg_temp.mk('e5', 'A', interval '2 days');
select pg_temp.mk('e6', 'A', interval '2 days');
select pg_temp.mk('e8', 'A', interval '10 days');
update public.events set cancelled_at = now() where id = pg_temp.u('e3');
update public.events set created_by = pg_temp.u('1') where id = pg_temp.u('e5');
update public.event_groups set created_at = now() - interval '10 days' where event_id in (pg_temp.u('e6'), pg_temp.u('e8'));
-- the updates above are made before the trigger matters: they must not count as changes
select test.rows('the cancel made while preparing the data is recorded as a change', $$select 1 from public.event_changes$$, 1);
delete from public.event_changes;

\echo == new events
set local role service_role;
select test.rows('eight notices are due: e1 for four people, e2 for one, e5 for three', $$select 1 from public.event_notices_due((select t from base)) where kind = 'new'$$, 8);
select test.rows('p1 gets e1 only (not their own e5, not an old group, not a past or cancelled one)', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('1') and kind = 'new' and title = 'e1'$$, 1);
select test.rows('and nothing else', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('1') and title <> 'e1'$$, 0);
select test.rows('the author of e5 gets nothing about it', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('1') and title = 'e5'$$, 0);
select test.rows('others do get e5', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('2') and title = 'e5'$$, 1);
select test.rows('p3 gets only the event of B', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('3') and title = 'e2'$$, 1);
select test.rows('p3 gets no event of A', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('3') and title <> 'e2'$$, 0);
select test.rows('someone who switched emails off gets nothing', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('4')$$, 0);
select test.rows('a cancelled event is not new', $$select 1 from public.event_notices_due((select t from base)) where title = 'e3'$$, 0);
select test.rows('a past event is not new', $$select 1 from public.event_notices_due((select t from base)) where title = 'e4'$$, 0);
select test.rows('an event whose group was added long ago is not new', $$select 1 from public.event_notices_due((select t from base)) where title = 'e6'$$, 0);
select test.rows('the details are returned for the email', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('1') and title = 'e1' and email like '%@example.test' and first_name = 'Nome1' and type = 'training' and starts_at is not null and ends_at is not null and not cancelled and change_id is null$$, 1);
select test.rows('nothing at 03:00', $$select 1 from public.event_notices_due((select t from base) - interval '9 hours')$$, 0);
select test.rows('nothing at 22:00', $$select 1 from public.event_notices_due((select t from base) + interval '10 hours')$$, 0);
select test.rows('nothing after three days', $$select 1 from public.event_notices_due((select t from base) + interval '4 days')$$, 0);
reset role;

\echo == marking as sent
set local role service_role;
select test.works('the server marks one as sent', $$select public.event_notices_mark_sent(pg_temp.u('1'), array[pg_temp.u('e1')], array[]::bigint[])$$);
select test.rows('it is not due again for p1', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('1') and title = 'e1'$$, 0);
select test.rows('still due for p2', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('2') and title = 'e1'$$, 1);
select test.works('marking twice is harmless', $$select public.event_notices_mark_sent(pg_temp.u('1'), array[pg_temp.u('e1')], null)$$);
reset role;

\echo == a group added later
select pg_temp.mk('e7', 'A', interval '3 days');
update public.event_groups set created_at = now() - interval '10 days' where event_id = pg_temp.u('e7');
insert into public.event_groups (event_id, group_id) select pg_temp.u('e7'), id from public.groups where code = 'B';
set local role service_role;
select test.rows('p3 hears about the event their group was added to', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('3') and title = 'e7'$$, 1);
select test.rows('p2 does not, their group was there long ago', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('2') and title = 'e7'$$, 0);
reset role;

\echo == changes
update public.events set title = 'e1 bis' where id = pg_temp.u('e1');
select test.rows('a new title is not a change that people plan around', $$select 1 from public.event_changes$$, 0);
update public.events set title = 'e1', starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour', venue = 'Pista B' where id = pg_temp.u('e1');
select test.rows('a new time and place is recorded once, with the old values', $$select 1 from public.event_changes where event_id = pg_temp.u('e1') and new_starts_at = old_starts_at + interval '1 hour' and new_venue = 'Pista B' and old_venue is null and not old_cancelled and not new_cancelled$$, 1);
update public.events set meetup_at = starts_at - interval '1 hour' where id = pg_temp.u('e2');
select test.rows('a new meetup time is recorded', $$select 1 from public.event_changes where event_id = pg_temp.u('e2') and old_meetup_at is null and new_meetup_at is not null$$, 1);
update public.events set cancelled_at = now() where id = pg_temp.u('e5');
select test.rows('cancelling is recorded', $$select 1 from public.event_changes where event_id = pg_temp.u('e5') and new_cancelled and not old_cancelled$$, 1);
update public.events set cancelled_at = null where id = pg_temp.u('e3');
select test.rows('putting a cancelled event back is recorded', $$select 1 from public.event_changes where event_id = pg_temp.u('e3') and old_cancelled and not new_cancelled$$, 1);
update public.events set venue = 'Pista C' where id = pg_temp.u('e8');
select test.rows('a change of place alone is recorded', $$select 1 from public.event_changes where event_id = pg_temp.u('e8') and old_venue is null and new_venue = 'Pista C'$$, 1);
update public.events set venue = 'Altrove' where id = pg_temp.u('e4');
select test.rows('a change to a finished event is not recorded', $$select 1 from public.event_changes where event_id = pg_temp.u('e4')$$, 0);
update public.events set venue = 'Pista B' where id = pg_temp.u('e1');
select test.rows('saving the same values again records nothing', $$select 1 from public.event_changes where event_id = pg_temp.u('e1')$$, 1);

create temp table chg as select id, event_id from public.event_changes;
grant select on chg to service_role;
set local role service_role;
select test.rows('p2 is told about the change to e1', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('2') and kind = 'changed' and title = 'e1' and change_id is not null and old_venue is null and venue = 'Pista B' and old_starts_at < starts_at$$, 1);
select test.rows('p3 is not told about a change to an event of A', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('3') and kind = 'changed' and title = 'e1'$$, 0);
select test.rows('p3 is told about the change to e2', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('3') and kind = 'changed' and title = 'e2'$$, 1);
select test.rows('p4 switched off and gets no change', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('4') and kind = 'changed'$$, 0);
select test.rows('a cancelled event comes with the cancelled flag', $$select 1 from public.event_notices_due((select t from base)) where kind = 'changed' and title = 'e5' and cancelled and not old_cancelled$$, 4);
select test.rows('a restored event comes with the flags the other way round', $$select 1 from public.event_notices_due((select t from base)) where kind = 'changed' and title = 'e3' and not cancelled and old_cancelled$$, 4);
select test.rows('changes are not sent at night', $$select 1 from public.event_notices_due((select t from base) + interval '11 hours') where kind = 'changed'$$, 0);
select test.rows('and not when older than three days, even for an event still to come', $$select 1 from public.event_notices_due((select t from base) + interval '4 days') where kind = 'changed' and title = 'e8'$$, 0);
select test.rows('the same change is sent within three days', $$select 1 from public.event_notices_due((select t from base) + interval '2 days') where kind = 'changed' and title = 'e8' and user_id = pg_temp.u('1')$$, 1);
select test.rows('a change is not sent once the event has ended', $$select 1 from public.event_notices_due((select t from base) + interval '2 days 4 hours') where kind = 'changed' and title in ('e1', 'e2', 'e5')$$, 0);
select test.works('the server marks a change as sent for p2', $$select public.event_notices_mark_sent(pg_temp.u('2'), array[]::uuid[], array[(select id from chg where event_id = pg_temp.u('e1'))])$$);
select test.rows('it is not due again for p2', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('2') and kind = 'changed' and title = 'e1'$$, 0);
select test.rows('but still due for p1', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('1') and kind = 'changed' and title = 'e1'$$, 1);
reset role;

\echo == the person who made the change
select test.login(pg_temp.u('c1'));
select test.works('a coach cancels an event', $$update public.events set cancelled_at = now() where id = pg_temp.u('e6')$$);
select test.logout();
select test.rows('the writer is recorded as the actor', $$select 1 from public.event_changes where event_id = pg_temp.u('e6') and actor = pg_temp.u('c1')$$, 1);
set local role service_role;
select test.rows('the coach is not told about their own change', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('c1') and title = 'e6' and kind = 'changed'$$, 0);
select test.rows('the others in the group are', $$select 1 from public.event_notices_due((select t from base)) where user_id = pg_temp.u('1') and title = 'e6' and kind = 'changed'$$, 1);
reset role;

\echo == who can see this
select test.login(pg_temp.u('1'));
select test.fails('a player cannot ask who is due', $$select * from public.event_notices_due()$$, 'permission denied');
select test.fails('a player cannot mark as sent', $$select public.event_notices_mark_sent(pg_temp.u('1'), array[pg_temp.u('e1')], null)$$, 'permission denied');
select test.fails('a player cannot read the changes', $$select 1 from public.event_changes$$, 'permission denied');
select test.fails('a player cannot read the logs', $$select 1 from public.event_new_log$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.fails('not even a coach can read the changes', $$select 1 from public.event_changes$$, 'permission denied');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot ask who is due', $$select * from public.event_notices_due()$$, 'permission denied');
select test.logout();

\echo == removing
delete from public.events where id = pg_temp.u('e1');
select test.rows('the changes and logs of a removed event are gone', $$select 1 from public.event_changes where event_id = pg_temp.u('e1') union all select 1 from public.event_new_log where event_id = pg_temp.u('e1') union all select 1 from public.event_change_log l join public.event_changes c on c.id = l.change_id where c.event_id = pg_temp.u('e1')$$, 0);
delete from public.profiles where id = pg_temp.u('2');
select test.rows('the logs of a removed person are gone', $$select 1 from public.event_new_log where user_id = pg_temp.u('2') union all select 1 from public.event_change_log where user_id = pg_temp.u('2')$$, 0);
