begin;
-- Deleting a sign in account must never erase history (migration 0042, decision 96).
-- v1 has a lot of history; v2 only signed up and never joined.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name, position) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board', null),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One', 'forward'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two', 'defence');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values ('A', '00000000-0000-0000-0000-000000000001'), ('A', '00000000-0000-0000-0000-000000000002')) v(code, uid)
  join public.groups g on g.code = v.code;
insert into public.events (id, type, title, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'game', 'g1', now() - interval '2 days', now() - interval '2 days' + interval '2 hours');
insert into public.event_groups select '00000000-0000-0000-0000-0000000000a1'::uuid, g.id from public.groups g where g.code = 'A';
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
grant usage on schema test to authenticated;

insert into public.attendance_answers (event_id, user_id, answer) values (pg_temp.u('a1'), pg_temp.u('1'), 'present');
insert into public.attendance_records (event_id, user_id, status) values (pg_temp.u('a1'), pg_temp.u('1'), 'on_time');
insert into public.game_stats (event_id, user_id, goals, assists) values (pg_temp.u('a1'), pg_temp.u('1'), 2, 1);
insert into public.event_messages (event_id, user_id, body) values (pg_temp.u('a1'), pg_temp.u('1'), 'Ciao a tutti');
insert into public.mvp_votes (event_id, voter_id, voted_id) values (pg_temp.u('a1'), pg_temp.u('2'), pg_temp.u('1'));
insert into public.game_ratings (event_id, rater_id, rated_id, rating) values (pg_temp.u('a1'), pg_temp.u('2'), pg_temp.u('1'), 4);

\echo == an account with history cannot be deleted
select test.fails('deleting the account of a member with history is refused', $$delete from auth.users where id = pg_temp.u('1')$$, 'profiles_id_fkey');
select test.rows('the profile is still there', $$select 1 from public.profiles where id = pg_temp.u('1')$$, 1);
select test.rows('the answer is still there', $$select 1 from public.attendance_answers where user_id = pg_temp.u('1')$$, 1);
select test.rows('the attendance is still there', $$select 1 from public.attendance_records where user_id = pg_temp.u('1')$$, 1);
select test.rows('the game numbers are still there', $$select 1 from public.game_stats where user_id = pg_temp.u('1') and goals = 2$$, 1);
select test.rows('the message is still there', $$select 1 from public.event_messages where user_id = pg_temp.u('1')$$, 1);
select test.rows('the vote is still there', $$select 1 from public.mvp_votes where voted_id = pg_temp.u('1')$$, 1);
select test.rows('the rating is still there', $$select 1 from public.game_ratings where rated_id = pg_temp.u('1')$$, 1);
select test.rows('the account is still there', $$select 1 from auth.users where id = pg_temp.u('1')$$, 1);

\echo == the whole sequence
select test.login(pg_temp.u('b1'));
select test.works('the board erases the personal data', $$select public.delete_member_data(pg_temp.u('1'))$$);
select test.logout();
select test.fails('the account of an anonymised member is still refused', $$delete from auth.users where id = pg_temp.u('1')$$, 'profiles_id_fkey');
-- What the server function does next: the account is disabled, not deleted.
update auth.users set email = 'deleted-' || id::text || '@deleted.invalid', raw_user_meta_data = '{}'::jsonb, banned_until = 'infinity'
 where id = pg_temp.u('1');
select test.rows('the account now has the unusable email and is banned', $$select 1 from auth.users where id = pg_temp.u('1') and email like 'deleted-%@deleted.invalid' and raw_user_meta_data = '{}'::jsonb and banned_until is not null$$, 1);
select test.rows('the old email is free again', $$select 1 from auth.users where email = 'p1@example.test'$$, 0);
select test.rows('all the history rows are still there', $$select 1 from public.attendance_answers where user_id = pg_temp.u('1') union all select 1 from public.attendance_records where user_id = pg_temp.u('1') union all select 1 from public.game_stats where user_id = pg_temp.u('1') union all select 1 from public.event_messages where user_id = pg_temp.u('1') union all select 1 from public.mvp_votes where voted_id = pg_temp.u('1') union all select 1 from public.game_ratings where rated_id = pg_temp.u('1')$$, 6);
select test.rows('the name on the history is the anonymous one', $$select 1 from public.event_messages m join public.profiles p on p.id = m.user_id where p.last_name = 'Eliminato'$$, 1);

\echo == accounts without a profile can still be deleted
select test.works('someone who never joined can be deleted', $$delete from auth.users where id = pg_temp.u('9')$$);
select test.rows('and is gone', $$select 1 from auth.users where id = pg_temp.u('9')$$, 0);
rollback;
\echo ALL ACCOUNT DELETE TESTS PASSED
