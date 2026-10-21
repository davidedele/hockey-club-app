begin;

-- People: board1 (board), coach1 (coach), p1 (player in A), p2 (player in A and B),
-- p3 (player in C1), stranger (confirmed account, no profile), unconfirmed (no profile).
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-0000000000d1', 'stranger@example.test', now()),
  ('00000000-0000-0000-0000-0000000000e1', 'unconfirmed@example.test', null);

insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000003', 'Pip', 'Three');
insert into public.profile_contacts (user_id, email, phone)
  select p.id, u.email, '000' from public.profiles p join auth.users u using (id);
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, u.id from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('A', '00000000-0000-0000-0000-000000000002'),
    ('B', '00000000-0000-0000-0000-000000000002'),
    ('C1', '00000000-0000-0000-0000-000000000003')) v(code, uid)
  join public.groups g on g.code = v.code
  join public.profiles u on u.id = v.uid::uuid;

\echo == groups
select test.login('00000000-0000-0000-0000-000000000001');
select test.rows('member sees the four groups', 'select * from public.groups', 4);
select test.fails('player cannot create a group', $$insert into public.groups (code, name) values ('Z', 'Z')$$, 'row-level security');
select test.affected('player cannot rename a group', $$update public.groups set name = 'X' where code = 'A'$$, 0);
select test.affected('player cannot delete a group', $$delete from public.groups where code = 'A'$$, 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.affected('coach cannot rename a group', $$update public.groups set name = 'X' where code = 'A'$$, 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.affected('board can rename a group', $$update public.groups set name = 'Prima' where code = 'A'$$, 1);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000d1');
select test.rows('account without profile sees no groups', 'select * from public.groups', 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read groups', 'select * from public.groups', 'permission denied');
select test.logout();

\echo == profiles
select test.login('00000000-0000-0000-0000-000000000001');
select test.rows('member sees all profiles', 'select * from public.profiles', 5);
select test.affected('player edits own jersey number', $$update public.profiles set jersey_number = 17, position = 'forward' where id = '00000000-0000-0000-0000-000000000001'$$, 1);
select test.affected('player cannot edit another profile', $$update public.profiles set jersey_number = 1 where id = '00000000-0000-0000-0000-000000000002'$$, 0);
select test.fails('player cannot change own id', $$update public.profiles set id = gen_random_uuid() where id = '00000000-0000-0000-0000-000000000001'$$, 'permission denied');
select test.fails('player cannot insert a profile', $$insert into public.profiles (id, first_name, last_name) values ('00000000-0000-0000-0000-0000000000d1', 'A', 'B')$$, 'permission denied');
select test.fails('jersey number must be 0 to 99', $$update public.profiles set jersey_number = 100 where id = '00000000-0000-0000-0000-000000000001'$$, 'check constraint');
select test.affected('player cannot delete a profile', $$delete from public.profiles where id = '00000000-0000-0000-0000-000000000002'$$, 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000d1');
select test.rows('account without profile sees no profiles', 'select * from public.profiles', 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.affected('coach edits another profile', $$update public.profiles set jersey_number = 9 where id = '00000000-0000-0000-0000-000000000002'$$, 1);
select test.affected('coach cannot delete a profile', $$delete from public.profiles where id = '00000000-0000-0000-0000-000000000002'$$, 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.affected('board deletes a profile', $$delete from public.profiles where id = '00000000-0000-0000-0000-000000000003'$$, 1);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read profiles', 'select * from public.profiles', 'permission denied');
select test.logout();

\echo == contacts
select test.login('00000000-0000-0000-0000-000000000001');
select test.rows('player sees only own contact', 'select * from public.profile_contacts', 1);
select test.affected('player edits own phone', $$update public.profile_contacts set phone = '333' where user_id = '00000000-0000-0000-0000-000000000001'$$, 1);
select test.affected('player cannot edit another phone', $$update public.profile_contacts set phone = '333' where user_id = '00000000-0000-0000-0000-000000000002'$$, 0);
select test.fails('player cannot edit own email', $$update public.profile_contacts set email = 'x@example.test' where user_id = '00000000-0000-0000-0000-000000000001'$$, 'permission denied');
select test.fails('player cannot insert a contact', $$insert into public.profile_contacts (user_id, email) values ('00000000-0000-0000-0000-0000000000d1', 'x@example.test')$$, 'permission denied');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.rows('coach sees all contacts', 'select * from public.profile_contacts', 4);
select test.affected('coach edits a phone', $$update public.profile_contacts set phone = '444' where user_id = '00000000-0000-0000-0000-000000000002'$$, 1);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000d1');
select test.rows('account without profile sees no contacts', 'select * from public.profile_contacts', 0);
select test.logout();

\echo == group members
select test.login('00000000-0000-0000-0000-000000000001');
select test.rows('member sees all group memberships', 'select * from public.group_members', 3);
select test.fails('player cannot join a group directly', $$insert into public.group_members (group_id, user_id) select id, '00000000-0000-0000-0000-000000000001' from public.groups where code = 'B'$$, 'row-level security');
select test.affected('player cannot remove another member', $$delete from public.group_members where user_id = '00000000-0000-0000-0000-000000000002'$$, 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.works('coach adds a member to a group', $$insert into public.group_members (group_id, user_id) select id, '00000000-0000-0000-0000-000000000001' from public.groups where code = 'B'$$);
select test.affected('coach removes a member from a group', $$delete from public.group_members where user_id = '00000000-0000-0000-0000-000000000001' and group_id = (select id from public.groups where code = 'B')$$, 1);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000d1');
select test.rows('account without profile sees no memberships', 'select * from public.group_members', 0);
select test.logout();

\echo == roles
select test.login('00000000-0000-0000-0000-000000000001');
select test.rows('player sees only own roles', 'select * from public.user_roles', 0);
select test.fails('player cannot make self board', $$insert into public.user_roles values ('00000000-0000-0000-0000-000000000001', 'board')$$, 'row-level security');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.rows('coach sees all roles', 'select * from public.user_roles', 2);
select test.fails('coach cannot assign roles', $$insert into public.user_roles values ('00000000-0000-0000-0000-000000000001', 'coach')$$, 'row-level security');
select test.affected('coach cannot remove roles', $$delete from public.user_roles where role = 'coach'$$, 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.works('board assigns a coach role', $$insert into public.user_roles values ('00000000-0000-0000-0000-000000000002', 'coach')$$);
select test.affected('board removes a coach role', $$delete from public.user_roles where user_id = '00000000-0000-0000-0000-000000000002'$$, 1);
select test.fails('the last board member cannot be removed', $$delete from public.user_roles where role = 'board'$$, 'last_board_member');
select test.works('board adds a second board member', $$insert into public.user_roles values ('00000000-0000-0000-0000-000000000002', 'board')$$);
select test.affected('with two board members one can be removed', $$delete from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000b1' and role = 'board'$$, 1);
select test.logout();
-- Restore for the invite tests.
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board');
delete from public.user_roles where user_id = '00000000-0000-0000-0000-000000000002';

\echo == invites
select test.login('00000000-0000-0000-0000-000000000001');
select test.fails('player cannot create an invite', $$select public.create_invite((select id from public.groups where code = 'A'))$$, 'forbidden');
select test.fails('player cannot insert an invite', $$insert into public.invites (group_id, token_hash) values (1, '\x00')$$, 'permission denied');
select test.fails('player cannot revoke an invite', $$select public.revoke_invite(gen_random_uuid())$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot create an invite', $$select public.create_invite(1::smallint)$$, 'permission denied');
select test.fails('anonymous cannot redeem an invite', $$select public.redeem_invite('x', 'A', 'B')$$, 'permission denied');
select test.logout();

-- Coach creates invites; tokens are kept for later steps.
select test.login('00000000-0000-0000-0000-0000000000c1');
create temp table tokens (name text primary key, token text);
grant all on tokens to authenticated;
insert into tokens select 'good', public.create_invite((select id from public.groups where code = 'C2'));
insert into tokens select 'second', public.create_invite((select id from public.groups where code = 'C1'));
insert into tokens select 'expired', public.create_invite((select id from public.groups where code = 'A'));
insert into tokens select 'revoked', public.create_invite((select id from public.groups where code = 'A'));
insert into tokens select 'late', public.create_invite((select id from public.groups where code = 'A'));
select test.rows('coach sees the invites', 'select * from public.invites', 5);
select test.rows('tokens are not stored in clear', $$select * from public.invites i join tokens t on i.token_hash = convert_to(t.token, 'utf8')$$, 0);
select test.rows('invite lasts seven days', $$select * from public.invites where expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'$$, 5);
select test.works('coach revokes an invite', $$select public.revoke_invite((select id from public.invites i join tokens t on i.token_hash = sha256(convert_to(t.token, 'utf8')) where t.name = 'revoked'))$$);
select test.logout();
select test.login('00000000-0000-0000-0000-000000000001');
select test.rows('player cannot see invites', 'select * from public.invites', 0);
select test.logout();
update public.invites set expires_at = now() - interval '1 minute'
  where token_hash = sha256(convert_to((select token from tokens where name = 'expired'), 'utf8'));

\echo == redeeming
select test.login('00000000-0000-0000-0000-0000000000e1');
select test.fails('unconfirmed email cannot redeem', $$select public.redeem_invite((select token from tokens where name = 'good'), 'Una', 'Conf')$$, 'email_not_confirmed');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000d1');
select test.fails('unknown token is refused', $$select public.redeem_invite('nonsense', 'Sam', 'Stranger')$$, 'invite_invalid');
select test.fails('expired token is refused', $$select public.redeem_invite((select token from tokens where name = 'expired'), 'Sam', 'Stranger')$$, 'invite_invalid');
select test.fails('revoked token is refused', $$select public.redeem_invite((select token from tokens where name = 'revoked'), 'Sam', 'Stranger')$$, 'invite_invalid');
select test.fails('a new person must give names', $$select public.redeem_invite((select token from tokens where name = 'good'))$$, 'names_required');
select test.works('valid token creates the member', $$select public.redeem_invite((select token from tokens where name = 'good'), ' Sam ', 'Stranger')$$);
select test.rows('member now has a profile', $$select * from public.profiles where id = auth.uid() and first_name = 'Sam'$$, 1);
select test.rows('member contact holds the account email', $$select * from public.profile_contacts where user_id = auth.uid() and email = 'stranger@example.test'$$, 1);
select test.rows('member is in the invite group', $$select * from public.group_members m join public.groups g on g.id = m.group_id where m.user_id = auth.uid() and g.code = 'C2'$$, 1);
select test.rows('member gets no role', 'select * from public.user_roles', 0);
select test.fails('a token cannot be used twice', $$select public.redeem_invite((select token from tokens where name = 'good'), 'Sam', 'Stranger')$$, 'invite_invalid');
select test.works('an existing member joins a second group', $$select public.redeem_invite((select token from tokens where name = 'second'))$$);
select test.rows('member is now in two groups', $$select * from public.group_members where user_id = auth.uid()$$, 2);
select test.logout();
select test.login('00000000-0000-0000-0000-000000000003');
-- p3 was deleted earlier by the board, so p3 has no profile: names are needed again.
select test.fails('a used token stays used for other people', $$select public.redeem_invite((select token from tokens where name = 'good'), 'Pip', 'Three')$$, 'invite_invalid');
select test.logout();

rollback;
\echo ALL TESTS PASSED
