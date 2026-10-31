begin;

-- People: board1 (board), coach1 (coach), p1 and p2 (players), u9 (account without a profile).
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
grant usage on schema test to service_role;
\echo == subscriptions
select test.login(pg_temp.u('1'));
select test.works('a player saves a phone', $$select public.save_push_subscription('https://push.example/aaa', repeat('p', 30), repeat('a', 12))$$);
select test.rows('and sees it', $$select 1 from public.push_subscriptions$$, 1);
select test.fails('a phone cannot be added by writing the table', $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.u('1'), 'https://push.example/bbb', repeat('p', 30), repeat('a', 12))$$, 'permission denied');
select test.fails('an address that is not https is refused', $$select public.save_push_subscription('http://push.example/ccc', repeat('p', 30), repeat('a', 12))$$, 'check constraint');
select test.fails('keys that are too short are refused', $$select public.save_push_subscription('https://push.example/ddd', 'x', 'y')$$, 'check constraint');
select test.works('a second phone of the same person', $$select public.save_push_subscription('https://push.example/eee', repeat('q', 30), repeat('b', 12))$$);
select test.works('saving the same phone again does not duplicate it', $$select public.save_push_subscription('https://push.example/eee', repeat('q', 30), repeat('b', 12))$$);
select test.rows('two phones', $$select 1 from public.push_subscriptions$$, 2);
select test.logout();
select test.login(pg_temp.u('2'));
select test.rows('another player sees none of them', $$select 1 from public.push_subscriptions$$, 0);
select test.affected('another player cannot remove them', $$delete from public.push_subscriptions$$, 0);
select test.works('signing in on the same phone moves it to the new account', $$select public.save_push_subscription('https://push.example/aaa', repeat('p', 30), repeat('a', 12))$$);
select test.rows('the new account has it', $$select 1 from public.push_subscriptions$$, 1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('the first account lost it', $$select 1 from public.push_subscriptions$$, 1);
select test.affected('a player removes their own phone', $$delete from public.push_subscriptions$$, 1);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('staff do not see the phones of players', $$select 1 from public.push_subscriptions where user_id <> pg_temp.u('c1')$$, 0);
select test.logout();
select test.login(pg_temp.u('9'));
select test.fails('an account without a profile cannot save a phone', $$select public.save_push_subscription('https://push.example/zzz', repeat('p', 30), repeat('a', 12))$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot save a phone', $$select public.save_push_subscription('https://push.example/zzz', repeat('p', 30), repeat('a', 12))$$, 'permission denied');
select test.fails('anonymous cannot read the phones', $$select * from public.push_subscriptions$$, 'permission denied');
select test.logout();

\echo == what a person chose
select test.login(pg_temp.u('1'));
select test.works('a player chooses a channel', $$select public.set_notification_pref('reminder', 'both')$$);
select test.works('and changes it', $$select public.set_notification_pref('reminder', 'push')$$);
select test.rows('one row per kind', $$select 1 from public.notification_prefs where kind = 'reminder' and channel = 'push'$$, 1);
select test.fails('an unknown kind is refused', $$select public.set_notification_pref('spam', 'push')$$, 'check constraint');
select test.fails('an unknown channel is refused', $$select public.set_notification_pref('reminder', 'sms')$$, 'check constraint');
select test.fails('a choice cannot be written to the table', $$insert into public.notification_prefs values (pg_temp.u('1'), 'changes', 'off')$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('2'));
select test.rows('another player does not see it', $$select 1 from public.notification_prefs$$, 0);
select test.logout();

\echo == push or email
select public.save_push_subscription('https://push.example/p1', repeat('p', 30), repeat('a', 12)) from (select set_config('request.jwt.claim.sub', pg_temp.u('1')::text, true)) x;
set local role service_role;
select test.rows('a person with a phone and the default choice gets push only', $$select 1 from public.notification_route(pg_temp.u('1'), 'changes') where push and not email$$, 1);
select test.rows('a person with no phone gets email only', $$select 1 from public.notification_route(pg_temp.u('c1'), 'changes') where not push and email$$, 1);
select test.rows('the phone comes with its keys', $$select 1 from public.notification_route(pg_temp.u('1'), 'changes') where subscriptions -> 0 ->> 'endpoint' = 'https://push.example/p1'$$, 1);
select test.rows('the choice "push" is push only', $$select 1 from public.notification_route(pg_temp.u('1'), 'reminder') where push and not email$$, 1);
reset role;
select public.set_notification_pref('x', 'x') where false;
insert into public.notification_prefs values (pg_temp.u('1'), 'announcement', 'both'), (pg_temp.u('1'), 'discussion', 'email'), (pg_temp.u('1'), 'certificate', 'off'), (pg_temp.u('c1'), 'announcement', 'push');
set local role service_role;
select test.rows('"both" is push and email', $$select 1 from public.notification_route(pg_temp.u('1'), 'announcement') where push and email$$, 1);
select test.rows('"email" is email only even with a phone', $$select 1 from public.notification_route(pg_temp.u('1'), 'discussion') where not push and email$$, 1);
select test.rows('"off" is nothing', $$select 1 from public.notification_route(pg_temp.u('1'), 'certificate') where not push and not email$$, 1);
select test.rows('"push" without a phone is nothing, not an email', $$select 1 from public.notification_route(pg_temp.u('c1'), 'announcement') where not push and not email$$, 1);
reset role;
insert into public.reminder_prefs (user_id, enabled) values (pg_temp.u('c1'), false);
set local role service_role;
select test.rows('the email switch off stops the email whatever the choice', $$select 1 from public.notification_route(pg_temp.u('c1'), 'changes') where not push and not email$$, 1);
select test.rows('a removed phone is gone', $$select 1 from public.push_remove('https://push.example/p1') $$, 1);
reset role;
select test.rows('and so are its rows', $$select 1 from public.push_subscriptions where endpoint = 'https://push.example/p1'$$, 0);
select test.login(pg_temp.u('1'));
select test.fails('a player cannot ask how to reach somebody', $$select * from public.notification_route(pg_temp.u('c1'), 'changes')$$, 'permission denied');
select test.fails('a player cannot remove a phone through the server function', $$select public.push_remove('https://push.example/aaa')$$, 'permission denied');
select test.logout();
rollback;
\echo ALL PUSH TESTS PASSED
