begin;

-- People: p1, p2 in A with emails. coach1 is staff.
insert into auth.users (id, email, email_confirmed_at)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'p' || n || '@example.test', now() from generate_series(1, 2) n;
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now());
insert into public.profiles (id, first_name, last_name)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'Nome' || chr(64 + n), 'Cognome' || chr(64 + n) from generate_series(1, 2) n;
insert into public.profiles (id, first_name, last_name) values ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.profile_contacts (user_id, email)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'p' || n || '@example.test' from generate_series(1, 2) n;
insert into public.group_members (group_id, user_id)
  select g.id, ('00000000-0000-0000-0000-00000000000' || n)::uuid from public.groups g, generate_series(1, 2) n where g.code = 'A';

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create temp table base as select ((now() at time zone 'Europe/Rome')::date + time '12:00') at time zone 'Europe/Rome' as t;
grant select on base to service_role;
grant usage on schema test to service_role;

insert into public.events (id, type, title, starts_at, ends_at)
  select pg_temp.u('e1'), 'training', 'e1', t + interval '2 days', t + interval '2 days 1 hour' from base;
insert into public.event_groups select pg_temp.u('e1'), id from public.groups where code = 'A';
insert into public.attendance_records (event_id, user_id, status) values (pg_temp.u('e1'), pg_temp.u('2'), 'not_called_up');

\echo == reminders
set local role service_role;
select test.rows('a person called up is still reminded', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('1')$$, 1);
select test.rows('a person not called up gets no reminder', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('2')$$, 0);
reset role;

\echo == who has not answered
select test.login(pg_temp.u('c1'));
select test.rows('the list holds the person called up', $$select 1 from public.unanswered_people() where user_id = pg_temp.u('1')$$, 1);
select test.rows('the list leaves out the person not called up', $$select 1 from public.unanswered_people() where user_id = pg_temp.u('2')$$, 0);
select test.logout();

\echo == called up again
select test.login(pg_temp.u('c1'));
select test.works('staff put the person back', $$select public.set_player_state(pg_temp.u('e1'), pg_temp.u('2'), 'waiting')$$);
select test.rows('the person is on the list again', $$select 1 from public.unanswered_people() where user_id = pg_temp.u('2')$$, 1);
select test.logout();
set local role service_role;
select test.rows('and gets the reminder again', $$select 1 from public.reminders_due((select t from base)) where user_id = pg_temp.u('2')$$, 1);
reset role;

rollback;
