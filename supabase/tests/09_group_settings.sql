begin;

-- People: board1 (board), coach1 (coach), p1 (player in A).
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select id, '00000000-0000-0000-0000-000000000001' from public.groups where code = 'A';
-- e1 is only for C2, e2 is for C1 and C2.
insert into public.events (id, type, title, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'training', 'e1', now() + interval '1 day', now() + interval '1 day 1 hour'),
  ('00000000-0000-0000-0000-0000000000e2', 'training', 'e2', now() + interval '2 days', now() + interval '2 days 1 hour');
insert into public.event_groups select '00000000-0000-0000-0000-0000000000e1', id from public.groups where code = 'C2';
insert into public.event_groups select '00000000-0000-0000-0000-0000000000e2', id from public.groups where code in ('C1', 'C2');

\echo == group settings
select test.login('00000000-0000-0000-0000-000000000001');
select test.rows('a member reads the group settings', $$select game_dark, weekly_limit from public.groups$$, 4);
select test.affected('a player cannot change a group', $$update public.groups set game_dark = '#000000'$$, 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.affected('a coach cannot change a group', $$update public.groups set weekly_limit = 3$$, 0);
select test.fails('a coach cannot add a group', $$insert into public.groups (code, name) values ('D', 'D')$$, 'row-level security');
select test.fails('a coach cannot upload a group picture', $$insert into storage.objects (bucket_id, name) values ('club', 'group-1-1000000000.png')$$, 'row-level security');
select test.works('a coach can still upload the club logo', $$insert into storage.objects (bucket_id, name) values ('club', 'logo-1000000000.png')$$);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.affected('the board sets colours and a weekly limit', $$update public.groups set game_dark = '#111111', game_light = '#ffd400', weekly_limit = 2 where code = 'A'$$, 1);
select test.fails('a colour must be a hex code', $$update public.groups set game_light = 'yellow' where code = 'A'$$, 'violates check constraint');
select test.fails('the weekly limit is 1 to 14', $$update public.groups set weekly_limit = 0 where code = 'A'$$, 'violates check constraint');
select test.fails('the id cannot be changed', $$update public.groups set id = 99 where code = 'A'$$, 'can only be updated to DEFAULT');
select test.works('the board uploads a group picture', $$insert into storage.objects (bucket_id, name) values ('club', 'group-1-1000000000.png')$$);
select test.affected('the board sets the group picture', $$update public.groups set logo_path = 'group-1-1000000000.png' where code = 'A'$$, 1);
select test.works('the board adds a group', $$insert into public.groups (code, name) values ('D', 'Debuttanti')$$);
select test.affected('the board removes an empty group', $$delete from public.groups where code = 'D'$$, 1);
select test.fails('a group cannot go while an event has only that group', $$delete from public.groups where code = 'C2'$$, 'event_needs_group');
select test.affected('a group whose events have another group can go', $$delete from public.groups where code = 'C1'$$, 1);
select test.affected('the board removes a group picture', $$delete from storage.objects where name = 'group-1-1000000000.png'$$, 1);
select test.logout();

rollback;
\echo ALL GROUP SETTINGS TESTS PASSED
