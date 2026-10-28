begin;

-- People: board1 (board), coach1 (coach), p1 and p2 in A, p3 in B, x1 without a profile.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-0000000000f1', 'x1@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000003', 'Pau', 'Three');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('A', '00000000-0000-0000-0000-000000000002'),
    ('B', '00000000-0000-0000-0000-000000000003')) v(code, uid)
  join public.groups g on g.code = v.code;

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.mk(p_id text, p_group text, p_days integer) returns void
language plpgsql as $$
begin
  insert into public.events (id, type, title, starts_at, ends_at)
    values (pg_temp.u(p_id), 'training', p_id, now() + make_interval(days => p_days),
            now() + make_interval(days => p_days) + interval '1 hour');
  insert into public.event_groups select pg_temp.u(p_id), id from public.groups where code = p_group;
end $$;
select pg_temp.mk('e1', 'A', 3);
select pg_temp.mk('e2', 'B', 4);
select pg_temp.mk('e3', 'A', -100);
select pg_temp.mk('e4', 'A', -10);
update public.events set cancelled_at = now() where id = pg_temp.u('e1');

\echo == tokens
select test.login(pg_temp.u('1'));
select test.works('a player gets a token', $$select public.my_calendar_token()$$);
select test.rows('the token has 64 characters', $$select 1 from public.calendar_tokens where length(token) = 64$$, 1);
select test.rows('asking again gives the same token', $$select 1 where public.my_calendar_token() = public.my_calendar_token()$$, 1);
select test.rows('a player reads only their own token row', $$select 1 from public.calendar_tokens$$, 1);
select test.fails('a player cannot write a token directly', $$insert into public.calendar_tokens (user_id, token) values (pg_temp.u('2'), repeat('a', 64))$$, 'permission denied');
select test.fails('a player cannot change the token directly', $$update public.calendar_tokens set token = repeat('b', 64)$$, 'permission denied');
select test.fails('a player cannot delete a token directly', $$delete from public.calendar_tokens$$, 'permission denied');
select test.fails('a player cannot read the feed function', $$select * from public.calendar_events(repeat('a', 64))$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('2'));
select test.works('another player gets a token', $$select public.my_calendar_token()$$);
select test.rows('they see only their own row', $$select 1 from public.calendar_tokens$$, 1);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.works('a coach gets a token', $$select public.my_calendar_token()$$);
select test.rows('even a coach reads only their own token row', $$select 1 from public.calendar_tokens$$, 1);
select test.logout();
select test.login(pg_temp.u('b1'));
select test.rows('even the board reads only their own token row (none yet)', $$select 1 from public.calendar_tokens$$, 0);
select test.logout();
select test.login(pg_temp.u('f1'));
select test.fails('someone without a profile gets no token', $$select public.my_calendar_token()$$, 'forbidden');
select test.fails('nor a new one', $$select public.new_calendar_token()$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot ask for a token', $$select public.my_calendar_token()$$, 'permission denied');
select test.fails('anonymous cannot read tokens', $$select 1 from public.calendar_tokens$$, 'permission denied');
select test.logout();

\echo == new token
create temp table keep (t text);
grant all on keep to authenticated;
select test.login(pg_temp.u('1'));
insert into keep select public.my_calendar_token();
select test.rows('a new token differs from the old one', $$select 1 where public.new_calendar_token() <> (select t from keep)$$, 1);
select test.rows('the player still has one row', $$select 1 from public.calendar_tokens$$, 1);
select test.logout();
select test.rows('the old token no longer finds anything', $$select 1 from public.calendar_events((select t from keep))$$, 0);

\echo == feed
select test.login(pg_temp.u('1'));
create temp table tok1 as select public.my_calendar_token() as t;
select test.logout();
select test.login(pg_temp.u('3'));
create temp table tok3 as select public.my_calendar_token() as t;
select test.logout();
select test.login(pg_temp.u('c1'));
create temp table tokc as select public.my_calendar_token() as t;
select test.logout();
grant select on tok1, tok3, tokc to service_role;
grant usage on schema test to service_role;
set local role service_role;
select test.rows('a player of A gets the events of A, recent included, old left out', $$select 1 from public.calendar_events((select t from tok1))$$, 2);
select test.rows('the cancelled event is in the feed marked cancelled', $$select 1 from public.calendar_events((select t from tok1)) where cancelled_at is not null$$, 1);
select test.rows('an event of B is not in the feed of a player of A', $$select 1 from public.calendar_events((select t from tok1)) where title = 'e2'$$, 0);
select test.rows('a player of B gets only the event of B', $$select 1 from public.calendar_events((select t from tok3))$$, 1);
select test.rows('a coach gets the events of every group', $$select 1 from public.calendar_events((select t from tokc))$$, 3);
select test.rows('an unknown token gives nothing', $$select 1 from public.calendar_events(repeat('0', 64))$$, 0);
select test.rows('an empty token gives nothing', $$select 1 from public.calendar_events('')$$, 0);
select test.rows('a null token gives nothing', $$select 1 from public.calendar_events(null)$$, 0);
reset role;

\echo == a removed person
delete from public.profiles where id = pg_temp.u('3');
select test.rows('the token of a removed person is gone', $$select 1 from public.calendar_tokens where user_id = pg_temp.u('3')$$, 0);

