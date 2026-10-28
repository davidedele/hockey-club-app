begin;

-- People: p1, p2, p4, p5 in A; p3 in B; p6 without a profile.
insert into auth.users (id, email, email_confirmed_at)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'p' || n || '@example.test', now() from generate_series(1, 6) n;
insert into public.profiles (id, first_name, last_name)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'Nome' || n, 'Cognome' || n from generate_series(1, 5) n;
insert into public.profile_contacts (user_id, email)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'p' || n || '@example.test' from generate_series(1, 5) n;
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('A', '00000000-0000-0000-0000-000000000002'),
    ('B', '00000000-0000-0000-0000-000000000003'),
    ('A', '00000000-0000-0000-0000-000000000004'),
    ('A', '00000000-0000-0000-0000-000000000005')) v(code, uid)
  join public.groups g on g.code = v.code;

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;

-- The moment the tests pretend it is: today at 12:00 in Italy.
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
select pg_temp.mk('e2', 'A', interval '20 hours');
select pg_temp.mk('e3', 'B', interval '2 days');
select pg_temp.mk('e4', 'A', interval '5 days');
select pg_temp.mk('e5', 'A', interval '2 days');
select pg_temp.mk('e6', 'A', interval '-1 day');
update public.events set cancelled_at = now() where id = pg_temp.u('e5');
insert into public.attendance_answers (event_id, user_id, answer) values (pg_temp.u('e1'), pg_temp.u('4'), 'present');
insert into public.reminder_prefs (user_id, enabled) values (pg_temp.u('5'), false);

\echo == who is due
set local role service_role;
select test.rows('six reminders are due at noon', $$select 1 from public.reminders_due((select t from base))$$, 6);
select test.rows('p1 waits for two events', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('1')$$, 2);
select test.rows('an event less than a day away is a last reminder', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('1') and title = 'e2' and kind = 'last'$$, 1);
select test.rows('an event two days away is a first reminder', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('1') and title = 'e1' and kind = 'first'$$, 1);
select test.rows('the email is returned for sending', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('1') and email = 'p1@example.test' and first_name = 'Nome1'$$, 2);
select test.rows('a person of B gets only the event of B', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('3') and title = 'e3'$$, 1);
select test.rows('nobody gets an event of another group', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('3') and title <> 'e3'$$, 0);
select test.rows('someone who answered is not asked again for that event', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('4') and title = 'e1'$$, 0);
select test.rows('but still for the other one', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('4') and title = 'e2'$$, 1);
select test.rows('someone who switched reminders off gets nothing', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('5')$$, 0);
select test.rows('a cancelled event is left out', $$select 1 from public.reminders_due((select t from base)) where title = 'e5'$$, 0);
select test.rows('an event more than three days away is left out', $$select 1 from public.reminders_due((select t from base)) where title = 'e4'$$, 0);
select test.rows('a past event is left out', $$select 1 from public.reminders_due((select t from base)) where title = 'e6'$$, 0);
select test.rows('nothing at 03:00', $$select 1 from public.reminders_due((select t from base) - interval '9 hours')$$, 0);
select test.rows('nothing at 22:00', $$select 1 from public.reminders_due((select t from base) + interval '10 hours')$$, 0);
select test.rows('still sent at 21:59', $$select 1 from public.reminders_due((select t from base) + interval '9 hours 59 minutes') where user_id = pg_temp.u('3')$$, 1);

\echo == marking as sent
select test.works('the server marks a first reminder', $$select public.reminders_mark_sent(pg_temp.u('1'), array[pg_temp.u('e1')], 'first')$$);
select test.rows('it is not due again', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('1') and title = 'e1'$$, 0);
select test.rows('the other event is still due', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('1') and title = 'e2'$$, 1);
select test.works('marking twice is harmless', $$select public.reminders_mark_sent(pg_temp.u('1'), array[pg_temp.u('e1')], 'first')$$);
select test.works('the server marks a last reminder', $$select public.reminders_mark_sent(pg_temp.u('1'), array[pg_temp.u('e2')], 'last')$$);
select test.rows('p1 has nothing left', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('1')$$, 0);
select test.rows('after the first reminder, the last one is still due when the event comes closer', $$select 1 from public.reminders_due((select t from base) + interval '1 day 1 hour') where user_id = pg_temp.u('1') and title = 'e1' and kind = 'last'$$, 1);
select test.works('the server marks the last reminder of e1', $$select public.reminders_mark_sent(pg_temp.u('1'), array[pg_temp.u('e1')], 'last')$$);
select test.rows('then e1 is never due again for p1', $$select 1 from public.reminders_due((select t from base) + interval '1 day 1 hour') where user_id = pg_temp.u('1') and title = 'e1'$$, 0);
select test.rows('a person who got nothing yet gets the last reminder when the event comes closer', $$select 1 from public.reminders_due((select t from base) + interval '1 day 2 hours') where user_id = pg_temp.u('2') and title = 'e1' and kind = 'last'$$, 1);
reset role;

\echo == people
select test.login(pg_temp.u('1'));
select test.fails('a player cannot ask who is due', $$select * from public.reminders_due()$$, 'permission denied');
select test.fails('a player cannot mark reminders as sent', $$select public.reminders_mark_sent(pg_temp.u('1'), array[pg_temp.u('e1')], 'first')$$, 'permission denied');
select test.fails('a player cannot read the log', $$select 1 from public.reminder_log$$, 'permission denied');
select test.works('a player switches reminders off', $$select public.set_reminders(false)$$);
select test.rows('a player reads only their own choice', $$select 1 from public.reminder_prefs$$, 1);
select test.fails('a player cannot write the choices directly', $$update public.reminder_prefs set enabled = true$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('2'));
select test.rows('another player sees only their own row (none yet)', $$select 1 from public.reminder_prefs$$, 0);
select test.logout();
select test.login(pg_temp.u('6'));
select test.fails('someone without a profile cannot switch', $$select public.set_reminders(false)$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot switch', $$select public.set_reminders(false)$$, 'permission denied');
select test.fails('anonymous cannot read the choices', $$select 1 from public.reminder_prefs$$, 'permission denied');
select test.logout();
set local role service_role;
select test.rows('after switching off, p1 is not due anything', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('1')$$, 0);
reset role;
select test.login(pg_temp.u('1'));
select test.works('a player switches reminders back on', $$select public.set_reminders(true)$$);
select test.logout();
set local role service_role;
select test.rows('p1 is due again for what was not sent (nothing, all sent)', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('1')$$, 0);
reset role;

\echo == a removed event or person
delete from public.events where id = pg_temp.u('e1');
select test.rows('the log of a removed event is gone', $$select 1 from public.reminder_log where event_id = pg_temp.u('e1')$$, 0);
delete from public.profiles where id = pg_temp.u('1');
select test.rows('the log and choice of a removed person are gone', $$select 1 from public.reminder_log where user_id = pg_temp.u('1') union all select 1 from public.reminder_prefs where user_id = pg_temp.u('1')$$, 0);
