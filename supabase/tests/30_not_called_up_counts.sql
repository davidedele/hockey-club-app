begin;

-- People: p1 and p2 in A. coach1 is staff.
insert into auth.users (id, email, email_confirmed_at)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'p' || n || '@example.test', now() from generate_series(1, 2) n;
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now());
insert into public.profiles (id, first_name, last_name)
  select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'Nome' || chr(64 + n), 'Cognome' || chr(64 + n) from generate_series(1, 2) n;
insert into public.profiles (id, first_name, last_name) values ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, ('00000000-0000-0000-0000-00000000000' || n)::uuid from public.groups g, generate_series(1, 2) n where g.code = 'A';

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;

-- A future training, a finished training and two finished games (one cancelled), all for A.
insert into public.events (id, type, title, starts_at, ends_at) values
  (pg_temp.u('e1'), 'training', 'future', now() + interval '2 days', now() + interval '2 days 1 hour'),
  (pg_temp.u('e2'), 'training', 'past', now() - interval '3 days', now() - interval '3 days' + interval '1 hour'),
  (pg_temp.u('f1'), 'game', 'played', now() - interval '2 days', now() - interval '2 days' + interval '1 hour'),
  (pg_temp.u('f2'), 'game', 'cancelled', now() - interval '1 day', now() - interval '1 day' + interval '1 hour');
update public.events set cancelled_at = now() where id = pg_temp.u('f2');
insert into public.event_groups select e, g.id from (values (pg_temp.u('e1')), (pg_temp.u('e2')), (pg_temp.u('f1')), (pg_temp.u('f2'))) v(e), public.groups g where g.code = 'A';

-- Both said present for e1 and e2. p2 was then marked not called up for both.
insert into public.attendance_answers (event_id, user_id, answer)
  select e, u, 'present' from (values (pg_temp.u('e1')), (pg_temp.u('e2'))) v(e), (values (pg_temp.u('1')), (pg_temp.u('2'))) w(u);
insert into public.attendance_records (event_id, user_id, status)
  select e, pg_temp.u('2'), 'not_called_up' from (values (pg_temp.u('e1')), (pg_temp.u('e2'))) v(e);

\echo == present counts and names
select test.login(pg_temp.u('1'));
select test.rows('only the person called up is counted as present', $$select 1 from public.event_present_counts(array[pg_temp.u('e1')]) where present = 1$$, 1);
select test.rows('the person not called up is not in the names', $$select 1 from public.event_present_people(pg_temp.u('e1')) where user_id = pg_temp.u('2')$$, 0);
select test.rows('the person called up is in the names', $$select 1 from public.event_present_people(pg_temp.u('e1')) where user_id = pg_temp.u('1')$$, 1);
select test.logout();

\echo == line-up candidates
select test.login(pg_temp.u('c1'));
select test.rows('the person not called up is not offered for the line-up', $$select 1 from public.lineup_candidates(pg_temp.u('e1')) where user_id = pg_temp.u('2')$$, 0);
select test.rows('the person called up is offered', $$select 1 from public.lineup_candidates(pg_temp.u('e1')) where user_id = pg_temp.u('1')$$, 1);
select test.logout();

\echo == attendance summary
select test.login(pg_temp.u('c1'));
select test.rows('an event not called up for is no answer and no missing answer, the played game still is missing', $$select 1 from public.attendance_summary() where user_id = pg_temp.u('2') and answered_present = 0 and no_answer = 1 and not_called_up = 1$$, 1);
select test.rows('the person called up keeps the answer', $$select 1 from public.attendance_summary() where user_id = pg_temp.u('1') and answered_present = 1$$, 1);
select test.logout();

\echo == season games
select test.rows('a game played is a season game', $$select 1 from public.season_games((case when extract(month from now() at time zone 'Europe/Rome') >= 9 then extract(year from now() at time zone 'Europe/Rome') else extract(year from now() at time zone 'Europe/Rome') - 1 end)::integer, null) id where id = pg_temp.u('f1')$$, 1);
select test.rows('a cancelled game is not a season game', $$select 1 from public.season_games((case when extract(month from now() at time zone 'Europe/Rome') >= 9 then extract(year from now() at time zone 'Europe/Rome') else extract(year from now() at time zone 'Europe/Rome') - 1 end)::integer, null) id where id = pg_temp.u('f2')$$, 0);

rollback;
