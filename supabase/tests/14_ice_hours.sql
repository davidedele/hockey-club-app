begin;

-- People: board1 (board), coach1 (coach), p1 in A, p2 in A.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two');
insert into public.profile_contacts (user_id, email) values
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('A', '00000000-0000-0000-0000-000000000002')) v(code, uid)
  join public.groups g on g.code = v.code;

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.day(n integer) returns date language sql as $$ select (now() at time zone 'Europe/Rome')::date + n $$;
create function pg_temp.mk(p_id text, p_day integer) returns void
language plpgsql as $$
declare v_start timestamptz := (pg_temp.day(p_day) + time '12:00') at time zone 'Europe/Rome';
begin
  insert into public.events (id, type, title, starts_at, ends_at)
    values (pg_temp.u(p_id), 'training', p_id, v_start, v_start + interval '1 hour');
  insert into public.event_groups select pg_temp.u(p_id), id from public.groups where code = 'A';
end $$;
select pg_temp.mk('a1', 3);
select pg_temp.mk('a2', 4);
select pg_temp.mk('d1', -2);
select pg_temp.mk('d2', -3);
update public.events set cancelled_at = now() where id = pg_temp.u('d1');

\echo == rinks
select test.login(pg_temp.u('b1'));
select test.works('the board adds a rink', $$insert into public.rinks (name) values ('Pista grande')$$);
select test.works('the board adds another rink', $$insert into public.rinks (name) values ('Pista piccola')$$);
select test.fails('two rinks cannot share a name', $$insert into public.rinks (name) values (' pista GRANDE ')$$, 'rinks_name_key');
select test.fails('a rink needs a name', $$insert into public.rinks (name) values ('   ')$$, 'check constraint');
select test.affected('the board renames a rink', $$update public.rinks set name = 'Pista piccola 2' where name = 'Pista piccola'$$, 1);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('a coach reads the rinks', $$select 1 from public.rinks$$, 2);
select test.fails('a coach cannot add a rink', $$insert into public.rinks (name) values ('Altra')$$, 'row-level security');
select test.affected('a coach cannot rename a rink', $$update public.rinks set name = 'X' where name = 'Pista grande'$$, 0);
select test.affected('a coach cannot remove a rink', $$delete from public.rinks$$, 0);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('a player reads the rinks', $$select 1 from public.rinks$$, 2);
select test.fails('a player cannot add a rink', $$insert into public.rinks (name) values ('Altra')$$, 'row-level security');
select test.affected('a player cannot remove a rink', $$delete from public.rinks$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read the rinks', $$select 1 from public.rinks$$, 'permission denied');
select test.logout();

\echo == prices
select test.login(pg_temp.u('b1'));
select test.works('the board sets a price', $$insert into public.rink_prices (rink_id, price_cents) select id, 15000 from public.rinks where name = 'Pista grande'$$);
select test.fails('a price cannot be negative', $$insert into public.rink_prices (rink_id, price_cents) select id, -1 from public.rinks where name = 'Pista piccola 2'$$, 'check constraint');
select test.affected('the board changes a price', $$update public.rink_prices set price_cents = 16000$$, 1);
select test.rows('the board reads the prices', $$select 1 from public.rink_prices$$, 1);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('a coach does not see the prices', $$select 1 from public.rink_prices$$, 0);
select test.fails('a coach cannot set a price', $$insert into public.rink_prices (rink_id, price_cents) select id, 1 from public.rinks where name = 'Pista piccola 2'$$, 'row-level security');
select test.affected('a coach cannot change a price', $$update public.rink_prices set price_cents = 1$$, 0);
select test.affected('a coach cannot remove a price', $$delete from public.rink_prices$$, 0);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('a player does not see the prices', $$select 1 from public.rink_prices$$, 0);
select test.logout();

\echo == rink on events
select test.login(pg_temp.u('c1'));
select test.works('a coach creates a training on a rink', $$select public.create_event('training', 'Giovedì', timestamptz '2027-03-04 22:30 Europe/Rome', timestamptz '2027-03-04 23:55 Europe/Rome', null, null, array[(select id from public.groups where code = 'A')], null, null, 2, (select id from public.rinks where name = 'Pista grande'))$$);
select test.rows('every event of the series has the rink', $$select 1 from public.events where title = 'Giovedì' and rink_id = (select id from public.rinks where name = 'Pista grande')$$, 3);
select test.fails('a rink that does not exist is refused', $$select public.create_event('training', 'X', now() + interval '1 day', now() + interval '1 day 1 hour', null, null, array[(select id from public.groups where code = 'A')], null, null, 0, 9999::smallint)$$, 'foreign key');
select test.works('an event without a rink is still possible', $$select public.create_event('training', 'Senza pista', now() + interval '1 day', now() + interval '1 day 1 hour', null, null, array[(select id from public.groups where code = 'A')])$$);
select test.affected('a coach sets the rink of an event', $$update public.events set rink_id = (select id from public.rinks where name = 'Pista piccola 2') where id = pg_temp.u('a1')$$, 1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.affected('a player cannot set the rink of an event', $$update public.events set rink_id = null where id = pg_temp.u('a1')$$, 0);
select test.logout();
select test.login(pg_temp.u('b1'));
select test.fails('a rink in use cannot be removed', $$delete from public.rinks where name = 'Pista piccola 2'$$, 'foreign key');
select test.logout();

\echo == cancelled events
select test.login(pg_temp.u('c1'));
select test.affected('a coach cancels an event', $$update public.events set cancelled_at = now() where id = pg_temp.u('a2')$$, 1);
select test.affected('a coach brings a cancelled event back', $$update public.events set cancelled_at = null where id = pg_temp.u('a2')$$, 1);
select test.affected('a coach cancels it again', $$update public.events set cancelled_at = now() where id = pg_temp.u('a2')$$, 1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.affected('a player cannot cancel an event', $$update public.events set cancelled_at = now() where id = pg_temp.u('a1')$$, 0);
select test.fails('nobody answers for a cancelled event', $$select public.answer_attendance(pg_temp.u('a2'), 'present')$$, 'event_cancelled');
select test.works('an event that is not cancelled still takes answers', $$select public.answer_attendance(pg_temp.u('a1'), 'present')$$);
select test.rows('a player still sees the cancelled event', $$select 1 from public.events where id = pg_temp.u('a2') and cancelled_at is not null$$, 1);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('a cancelled event is not asked of anyone', $$select 1 from public.unanswered_people(30) where user_id = pg_temp.u('2') and missing = 2$$, 1);
select test.rows('a cancelled past event is left out of the attendance summary', $$select 1 from public.attendance_summary() where user_id = pg_temp.u('1') and events_total = 1$$, 1);
select test.logout();
