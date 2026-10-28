begin;

-- People: board1 (board), coach1 (coach), p1 (player in A), and four new people with confirmed
-- accounts and no profile: n1 to n4.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000a1', 'n1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'n2@example.test', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'n3@example.test', now()),
  ('00000000-0000-0000-0000-0000000000a4', 'n4@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One');
insert into public.profile_contacts (user_id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test'),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, '00000000-0000-0000-0000-000000000001'::uuid from public.groups g where g.code = 'A';

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create temp table tokens (name text primary key, token text not null);
grant all on tokens to authenticated;

\echo == who can make team links
select test.login(pg_temp.u('c1'));
select test.fails('a coach cannot make a team link', $$select public.create_team_invite((select id from public.groups where code = 'A'))$$, 'forbidden');
select test.logout();
select test.login(pg_temp.u('1'));
select test.fails('a player cannot make a team link', $$select public.create_team_invite((select id from public.groups where code = 'A'))$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot make a team link', $$select public.create_team_invite(1::smallint)$$, 'permission denied');
select test.logout();

\echo == making them
select test.login(pg_temp.u('b1'));
select test.fails('fewer than two uses is refused', $$select public.create_team_invite((select id from public.groups where code = 'A'), 30, 1)$$, 'team_invite_invalid');
select test.fails('more than 200 uses is refused', $$select public.create_team_invite((select id from public.groups where code = 'A'), 30, 201)$$, 'team_invite_invalid');
select test.fails('zero days is refused', $$select public.create_team_invite((select id from public.groups where code = 'A'), 0, 10)$$, 'team_invite_invalid');
select test.fails('more than 90 days is refused', $$select public.create_team_invite((select id from public.groups where code = 'A'), 91, 10)$$, 'team_invite_invalid');
select test.fails('a group that does not exist is refused', $$select public.create_team_invite(999::smallint, 30, 10)$$, 'foreign key');
insert into tokens select 'team', public.create_team_invite((select id from public.groups where code = 'B'), 30, 2);
insert into tokens select 'long', public.create_team_invite((select id from public.groups where code = 'C1'));
insert into tokens select 'stopped', public.create_team_invite((select id from public.groups where code = 'C2'), 10, 5);
insert into tokens select 'old', public.create_team_invite((select id from public.groups where code = 'C2'), 10, 5);
select test.rows('the default is 100 uses and 30 days', $$select 1 from public.invites where max_uses = 100 and expires_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour'$$, 1);
select test.rows('tokens are not stored in clear', $$select 1 from public.invites i join tokens t on i.token_hash = convert_to(t.token, 'utf8')$$, 0);
select test.works('the board switches a team link off', $$select public.revoke_invite((select id from public.invites i join tokens t on i.token_hash = sha256(convert_to(t.token, 'utf8')) where t.name = 'stopped'))$$);
select test.logout();
update public.invites set expires_at = now() - interval '1 minute'
  where token_hash = sha256(convert_to((select token from tokens where name = 'old'), 'utf8'));

\echo == using one
select test.login(pg_temp.u('a1'));
select test.works('the first person joins with a team link', $$select public.redeem_invite((select token from tokens where name = 'team'), 'Nina', 'Uno')$$);
select test.rows('they are in the group', $$select 1 from public.group_members m join public.groups g on g.id = m.group_id where m.user_id = auth.uid() and g.code = 'B'$$, 1);
select test.works('the same person using it again changes nothing', $$select public.redeem_invite((select token from tokens where name = 'team'))$$);
select test.logout();
select test.login(pg_temp.u('b1'));
select test.rows('the link counts one use, not two', $$select 1 from public.invites where max_uses = 2 and use_count = 1 and used_at is null and used_by is null$$, 1);
select test.logout();
select test.login(pg_temp.u('a2'));
select test.works('a second person joins with the same link', $$select public.redeem_invite((select token from tokens where name = 'team'), 'Nino', 'Due')$$);
select test.logout();
select test.login(pg_temp.u('a3'));
select test.fails('a third person is refused, the link is full', $$select public.redeem_invite((select token from tokens where name = 'team'), 'Nora', 'Tre')$$, 'invite_invalid');
select test.rows('and did not get a profile', $$select 1 from public.profiles where id = auth.uid()$$, 0);
select test.works('the long link takes the third person', $$select public.redeem_invite((select token from tokens where name = 'long'), 'Nora', 'Tre')$$);
select test.fails('a switched off link is refused', $$select public.redeem_invite((select token from tokens where name = 'stopped'))$$, 'invite_invalid');
select test.fails('an expired team link is refused', $$select public.redeem_invite((select token from tokens where name = 'old'))$$, 'invite_invalid');
select test.logout();
select test.login(pg_temp.u('a4'));
select test.works('the long link still has room', $$select public.redeem_invite((select token from tokens where name = 'long'), 'Nico', 'Quattro')$$);
select test.logout();
select test.login(pg_temp.u('b1'));
select test.rows('the board sees the long link used twice', $$select 1 from public.invites where max_uses = 100 and use_count = 2$$, 1);
select test.rows('the full link is marked used', $$select 1 from public.invites where max_uses = 2 and use_count = 2 and used_at is not null$$, 1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('a player sees no invites', $$select 1 from public.invites$$, 0);
select test.logout();

\echo == single use invites still work
select test.login(pg_temp.u('c1'));
insert into tokens select 'single', public.create_invite((select id from public.groups where code = 'C2'));
select test.rows('a single use invite has one use', $$select 1 from public.invites where max_uses = 1 and use_count = 0 and expires_at < now() + interval '8 days'$$, 1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.works('a member joins another group with it', $$select public.redeem_invite((select token from tokens where name = 'single'))$$);
select test.logout();
select test.login(pg_temp.u('a2'));
select test.fails('it cannot be used a second time', $$select public.redeem_invite((select token from tokens where name = 'single'))$$, 'invite_invalid');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('it shows who used it', $$select 1 from public.invites where max_uses = 1 and use_count = 1 and used_by = pg_temp.u('1')$$, 1);
select test.logout();
