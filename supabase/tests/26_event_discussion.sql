begin;

-- People: board1 and coach1 with no group. In A: p1, p5. In B: p2. In C1: p4.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.test', now()),
  ('00000000-0000-0000-0000-000000000005', 'p5@example.test', now());
insert into public.profiles (id, first_name, last_name, position) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board', null),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach', null),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One', 'forward'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two', 'forward'),
  ('00000000-0000-0000-0000-000000000004', 'Pit', 'Four', 'goalie'),
  ('00000000-0000-0000-0000-000000000005', 'Pim', 'Five', 'forward');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('B', '00000000-0000-0000-0000-000000000002'),
    ('C1', '00000000-0000-0000-0000-000000000004'),
    ('A', '00000000-0000-0000-0000-000000000005')) v(code, uid)
  join public.groups g on g.code = v.code;

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.mk(p_id text, p_hours integer, p_groups text[]) returns void
language plpgsql as $$
declare v_start timestamptz := now() + (p_hours || ' hours')::interval;
begin
  insert into public.events (id, type, title, starts_at, ends_at)
    values (pg_temp.u(p_id), 'training', p_id, v_start, v_start + interval '1 hour');
  insert into public.event_groups select pg_temp.u(p_id), id from public.groups where code = any (p_groups);
end $$;

-- e1 and e2 are for A, e3 is for B.
select pg_temp.mk('e1', 48, array['A']);
select pg_temp.mk('e2', 72, array['A']);
select pg_temp.mk('e3', 96, array['B']);

\echo == who may write
select test.login_anon();
select test.fails('anonymous cannot write', $$select public.post_event_message(pg_temp.u('e1'), 'hi')$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('4'));
select test.fails('someone outside the groups cannot write', $$select public.post_event_message(pg_temp.u('e1'), 'hi')$$, 'forbidden');
select test.logout();
select test.login(pg_temp.u('1'));
select test.fails('direct insert is not allowed', $$insert into public.event_messages (event_id, user_id, body) values (pg_temp.u('e1'), pg_temp.u('1'), 'hi')$$, 'permission denied');
select test.fails('an unknown event', $$select public.post_event_message(pg_temp.u('99'), 'hi')$$, 'forbidden');
select test.fails('an empty message', $$select public.post_event_message(pg_temp.u('e1'), '   ')$$, 'message_empty');
select test.fails('a missing message', $$select public.post_event_message(pg_temp.u('e1'), null)$$, 'message_empty');
select test.fails('a message that is too long', $$select public.post_event_message(pg_temp.u('e1'), repeat('x', 1001))$$, 'message_too_long');
select test.works('a person of the group writes', $$select public.post_event_message(pg_temp.u('e1'), '  Who brings the pucks?  ')$$);
select test.rows('the message is stored trimmed', $$select 1 from public.event_messages where event_id = pg_temp.u('e1') and user_id = pg_temp.u('1') and body = 'Who brings the pucks?'$$, 1);
select test.rows('the sender has read it', $$select 1 from public.event_message_seen where event_id = pg_temp.u('e1') and user_id = pg_temp.u('1')$$, 1);
select test.works('a message of exactly 1000 characters', $$select public.post_event_message(pg_temp.u('e1'), repeat('x', 1000))$$);
select test.fails('a message cannot be changed', $$update public.event_messages set body = 'changed' where event_id = pg_temp.u('e1')$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.works('staff outside the groups can write', $$select public.post_event_message(pg_temp.u('e3'), 'Hello B')$$);
select test.logout();

\echo == who may read
select test.login(pg_temp.u('5'));
select test.rows('a person of the group reads the thread', $$select 1 from public.event_messages where event_id = pg_temp.u('e1')$$, 2);
select test.rows('and not the thread of another group', $$select 1 from public.event_messages where event_id = pg_temp.u('e3')$$, 0);
select test.logout();
select test.login(pg_temp.u('4'));
select test.rows('someone outside the groups reads nothing', $$select 1 from public.event_messages$$, 0);
select test.rows('and sees no read marks', $$select 1 from public.event_message_seen$$, 0);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('staff read every thread', $$select 1 from public.event_messages$$, 3);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read', $$select 1 from public.event_messages$$, 'permission denied');
select test.logout();

\echo == read marks and new messages
select test.login(pg_temp.u('5'));
select test.rows('two messages are new to a person who has not read them', $$select 1 from public.my_event_threads() where event_id = pg_temp.u('e1') and unread = 2$$, 1);
select test.rows('a thread of another group is not listed', $$select 1 from public.my_event_threads() where event_id = pg_temp.u('e3')$$, 0);
select test.works('the person reads the thread', $$select public.mark_event_seen(pg_temp.u('e1'))$$);
select test.rows('nothing is new any more', $$select 1 from public.my_event_threads() where event_id = pg_temp.u('e1') and unread = 0 and messages = 2$$, 1);
select test.rows('the group sees who has read', $$select 1 from public.event_message_seen where event_id = pg_temp.u('e1')$$, 2);
select test.fails('a person outside the event cannot mark it read', $$select public.mark_event_seen(pg_temp.u('e3'))$$, 'forbidden');
select test.works('the person writes too', $$select public.post_event_message(pg_temp.u('e1'), 'Me')$$);
select test.rows('their own message is not new to them', $$select 1 from public.my_event_threads() where event_id = pg_temp.u('e1') and unread = 0 and messages = 3$$, 1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('the other person has one new message', $$select 1 from public.my_event_threads() where event_id = pg_temp.u('e1') and unread = 1$$, 1);
select test.logout();
update public.event_message_seen set seen_at = '2000-01-01' where event_id = pg_temp.u('e1') and user_id = pg_temp.u('5');
select test.login(pg_temp.u('5'));
select test.rows('only the messages of others are new', $$select 1 from public.my_event_threads() where event_id = pg_temp.u('e1') and unread = 2$$, 1);
select test.logout();
select test.login(pg_temp.u('4'));
select test.fails('someone outside cannot list threads of others but lists none', $$select public.mark_event_seen(pg_temp.u('e1'))$$, 'forbidden');
select test.rows('and has no threads', $$select 1 from public.my_event_threads()$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot list threads', $$select 1 from public.my_event_threads()$$, 'permission denied');
select test.fails('anonymous cannot mark a thread read', $$select public.mark_event_seen(pg_temp.u('e1'))$$, 'permission denied');
select test.logout();

\echo == archive after fifteen days
update public.event_messages set created_at = now() - interval '20 days' where event_id = pg_temp.u('e1');
select test.login(pg_temp.u('1'));
select test.rows('a thread with old messages is archived', $$select 1 from public.my_event_threads() where event_id = pg_temp.u('e1') and archived$$, 1);
select test.works('a new message opens it again', $$select public.post_event_message(pg_temp.u('e1'), 'Back')$$);
select test.rows('it is no longer archived', $$select 1 from public.my_event_threads() where event_id = pg_temp.u('e1') and not archived$$, 1);
select test.logout();
update public.event_messages set created_at = now() - interval '14 days' where event_id = pg_temp.u('e1');
select test.login(pg_temp.u('1'));
select test.rows('fourteen days old is not archived yet', $$select 1 from public.my_event_threads() where event_id = pg_temp.u('e1') and not archived$$, 1);
select test.logout();

\echo == removing messages
select test.login(pg_temp.u('5'));
select test.affected('a person cannot remove another one''s message', $$delete from public.event_messages where event_id = pg_temp.u('e1') and user_id = pg_temp.u('1')$$, 0);
select test.affected('a person removes their own message', $$delete from public.event_messages where event_id = pg_temp.u('e1') and user_id = pg_temp.u('5')$$, 1);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.affected('staff remove any message', $$delete from public.event_messages where event_id = pg_temp.u('e1') and user_id = pg_temp.u('1') and body = 'Who brings the pucks?'$$, 1);
select test.logout();
select test.login(pg_temp.u('4'));
select test.affected('someone outside removes nothing', $$delete from public.event_messages$$, 0);
select test.logout();

\echo == removing an event removes its thread
select test.works('the event is removed', $$delete from public.events where id = pg_temp.u('e3')$$);
select test.rows('its messages are gone', $$select 1 from public.event_messages where event_id = pg_temp.u('e3')$$, 0);
select test.rows('and its read marks', $$select 1 from public.event_message_seen where event_id = pg_temp.u('e3')$$, 0);

rollback;
