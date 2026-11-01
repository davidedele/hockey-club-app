begin;
-- Migration 0050: nobody deletes a profile row directly (a delete erases the whole history through the cascades).
-- Migration 0051: scrub_deleted_account empties the sign up data of a deleted member's account, that person only.
-- b1 board, c1 coach, 1 the member with history, 2 and 3 other players with sign up data of their own.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now(), '{"first_name":"Bea","last_name":"Board"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now(), '{"first_name":"Caio","last_name":"Coach"}'),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now(), '{"sub":"00000000-0000-0000-0000-000000000001","email":"p1@example.test","first_name":"Pia","last_name":"One","email_verified":true,"phone_verified":false}'),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now(), '{"first_name":"Pio","last_name":"Two"}'),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now(), '{"first_name":"Pau","last_name":"Three"}');
insert into auth.identities (user_id, provider_id, identity_data)
  select id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'first_name', raw_user_meta_data ->> 'first_name', 'last_name', raw_user_meta_data ->> 'last_name', 'email_verified', true, 'phone_verified', false)
    from auth.users;
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Caio', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000003', 'Pau', 'Three');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board'), ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values ('A', '00000000-0000-0000-0000-000000000001'), ('A', '00000000-0000-0000-0000-000000000002'), ('A', '00000000-0000-0000-0000-000000000003')) v(code, uid)
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
set local session_replication_role = replica;  -- the line-up of a finished event is closed by a trigger
insert into public.event_lineup (event_id, slot, unit, user_id, set_by) values (pg_temp.u('a1'), 'centre', 1, pg_temp.u('1'), pg_temp.u('c1'));
reset session_replication_role;
create temp table history_before as
  select 'answer' k, count(*) n from public.attendance_answers where user_id = pg_temp.u('1')
  union all select 'record', count(*) from public.attendance_records where user_id = pg_temp.u('1')
  union all select 'stats', count(*) from public.game_stats where user_id = pg_temp.u('1')
  union all select 'message', count(*) from public.event_messages where user_id = pg_temp.u('1')
  union all select 'vote', count(*) from public.mvp_votes where voted_id = pg_temp.u('1')
  union all select 'rating', count(*) from public.game_ratings where rated_id = pg_temp.u('1')
  union all select 'lineup', count(*) from public.event_lineup where user_id = pg_temp.u('1');
grant select on history_before to authenticated;

\echo == nobody deletes a profile row
select test.rows('the signed in role has no delete right on profiles', $$select 1 where has_table_privilege('authenticated', 'public.profiles', 'DELETE')$$, 0);
select test.rows('the profiles_delete policy is gone', $$select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd = 'DELETE'$$, 0);
select test.login(pg_temp.u('b1'));
select test.fails('the board cannot delete a profile', $$delete from public.profiles where id = pg_temp.u('1')$$, 'permission denied');
select test.fails('the board cannot delete every profile', $$delete from public.profiles$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.fails('a coach cannot delete a profile', $$delete from public.profiles where id = pg_temp.u('1')$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('1'));
select test.fails('a member cannot delete their own profile', $$delete from public.profiles where id = pg_temp.u('1')$$, 'permission denied');
select test.logout();
select test.login_anon();
select test.fails('a signed out visitor cannot delete a profile', $$delete from public.profiles where id = pg_temp.u('1')$$, 'permission denied');
select test.logout();
select test.rows('every profile is still there', $$select 1 from public.profiles$$, 5);
select test.rows('every history row of the member stays (7 kinds)', $$select 1 from (select count(*) n, 'answer' k from public.attendance_answers where user_id = pg_temp.u('1') union all select count(*), 'record' from public.attendance_records where user_id = pg_temp.u('1') union all select count(*), 'stats' from public.game_stats where user_id = pg_temp.u('1') union all select count(*), 'message' from public.event_messages where user_id = pg_temp.u('1') union all select count(*), 'vote' from public.mvp_votes where voted_id = pg_temp.u('1') union all select count(*), 'rating' from public.game_ratings where rated_id = pg_temp.u('1') union all select count(*), 'lineup' from public.event_lineup where user_id = pg_temp.u('1')) now join history_before b on b.k = now.k and b.n = now.n where now.n = 1$$, 7);

\echo == the supported way still works
select test.login(pg_temp.u('b1'));
select test.works('the board still deletes a member through delete_member_data', $$select public.delete_member_data(pg_temp.u('3'))$$);
select test.logout();
select test.rows('and that member keeps the anonymous profile', $$select 1 from public.profiles where id = pg_temp.u('3') and last_name = 'Eliminato'$$, 1);

\echo == who may scrub an account
select test.login(pg_temp.u('2'));
select test.fails('a player cannot scrub an account', $$select public.scrub_deleted_account(pg_temp.u('3'))$$, 'forbidden');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.fails('a coach cannot scrub an account', $$select public.scrub_deleted_account(pg_temp.u('3'))$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('a signed out visitor cannot scrub an account', $$select public.scrub_deleted_account(pg_temp.u('3'))$$, 'permission denied');
select test.logout();
select test.rows('nothing was scrubbed by those calls', $$select 1 from auth.users where id = pg_temp.u('3') and raw_user_meta_data ->> 'first_name' = 'Pau'$$, 1);

\echo == the board cannot scrub a live member
select test.login(pg_temp.u('b1'));
select test.fails('a member whose data is not deleted is refused', $$select public.scrub_deleted_account(pg_temp.u('2'))$$, 'not_deleted');
select test.fails('so is the board member itself', $$select public.scrub_deleted_account(pg_temp.u('b1'))$$, 'not_deleted');
select test.fails('and an unknown id', $$select public.scrub_deleted_account(pg_temp.u('77'))$$, 'not_deleted');
select test.logout();
select test.rows('live members keep their sign up data', $$select 1 from auth.users where raw_user_meta_data ->> 'first_name' in ('Bea', 'Caio', 'Pio') and id in (pg_temp.u('b1'), pg_temp.u('c1'), pg_temp.u('2'))$$, 3);

\echo == the scrub
-- What the server function did before the scrub: the email in both places is already the unusable one.
update auth.users set email = 'deleted-' || id::text || '@deleted.invalid' where id = pg_temp.u('3');
update auth.identities set identity_data = jsonb_set(identity_data, '{email}', to_jsonb('deleted-' || user_id::text || '@deleted.invalid')) where user_id = pg_temp.u('3');
create temp table others_before as
  select u.id, u.raw_user_meta_data, i.identity_data from auth.users u join auth.identities i on i.user_id = u.id where u.id <> pg_temp.u('3');
select test.login(pg_temp.u('b1'));
select test.works('the board scrubs the deleted account', $$select public.scrub_deleted_account(pg_temp.u('3'))$$);
select test.works('it can run again', $$select public.scrub_deleted_account(pg_temp.u('3'))$$);
select test.logout();
select test.rows('the user metadata is an empty object', $$select 1 from auth.users where id = pg_temp.u('3') and raw_user_meta_data = '{}'::jsonb$$, 1);
select test.rows('the identity holds only sub, email and email_verified', $$select 1 from auth.identities where user_id = pg_temp.u('3') and (select array_agg(k order by k) from jsonb_object_keys(identity_data) k) = array['email', 'email_verified', 'sub']$$, 1);
select test.rows('the identity email is the unusable one', $$select 1 from auth.identities where user_id = pg_temp.u('3') and identity_data ->> 'email' = 'deleted-' || pg_temp.u('3')::text || '@deleted.invalid' and email = 'deleted-' || pg_temp.u('3')::text || '@deleted.invalid'$$, 1);
select test.rows('the identity sub is the account id', $$select 1 from auth.identities where user_id = pg_temp.u('3') and identity_data ->> 'sub' = pg_temp.u('3')::text and identity_data -> 'email_verified' = 'true'::jsonb$$, 1);
select test.rows('no name and no original email is left in the account', $$select 1 from auth.users u join auth.identities i on i.user_id = u.id where u.id = pg_temp.u('3') and (u.raw_user_meta_data::text || i.identity_data::text) ~* '(Pau|Three|p3@example)'$$, 0);
select test.rows('rows of other people are exactly as before', $$select 1 from auth.users u join auth.identities i on i.user_id = u.id join others_before o on o.id = u.id and o.raw_user_meta_data = u.raw_user_meta_data and o.identity_data = i.identity_data$$, 4);
select test.rows('the profile is still the anonymous one', $$select 1 from public.profiles where id = pg_temp.u('3') and first_name = 'Utente' and last_name = 'Eliminato'$$, 1);
rollback;
\echo ALL PROFILE DELETE AND SCRUB TESTS PASSED
