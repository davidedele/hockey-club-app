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
insert into public.rinks (id, name) overriding system value values (901, 'Pista A');
\echo == rink address
select test.login(pg_temp.u('b1'));
select test.works('the board sets an address and a note', $$update public.rinks set address = 'Via Roma 1, Milano', note = 'Parcheggio dietro' where id = 901$$);
select test.fails('an address cannot be empty text', $$update public.rinks set address = '   ' where id = 901$$, 'check constraint');
select test.fails('an address has a length limit', $$update public.rinks set address = repeat('x', 201) where id = 901$$, 'check constraint');
select test.fails('a note has a length limit', $$update public.rinks set note = repeat('x', 201) where id = 901$$, 'check constraint');
select test.works('the board adds a rink with an address', $$insert into public.rinks (name, address) values ('Pista B', 'Via Verdi 2')$$);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('a player reads the address', $$select 1 from public.rinks where address = 'Via Roma 1, Milano' and note = 'Parcheggio dietro'$$, 1);
select test.affected('a player cannot change the address', $$update public.rinks set address = 'Altrove' where id = 901$$, 0);
select test.fails('a player cannot add a rink with an address', $$insert into public.rinks (name, address) values ('Pista C', 'Via X')$$, 'row-level security');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.affected('a coach cannot change the address', $$update public.rinks set note = 'x' where id = 901$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot read rinks', $$select address from public.rinks$$, 'permission denied');
select test.logout();

\echo == the address in the feed
insert into public.groups (code, name) values ('Z', 'Z') on conflict do nothing;
insert into public.events (id, type, title, starts_at, ends_at, rink_id) values (pg_temp.u('e1'), 'training', 'Allenamento', now() + interval '1 day', now() + interval '1 day 1 hour', 901);
insert into public.event_groups (event_id, group_id) values (pg_temp.u('e1'), (select id from public.groups order by id limit 1));
insert into public.calendar_tokens (user_id, token) values (pg_temp.u('c1'), repeat('b', 64));
grant usage on schema test to service_role;
set local role service_role;
select test.rows('the feed carries the address of the rink', $$select 1 from public.calendar_events(repeat('b', 64)) where rink = 'Pista A' and address = 'Via Roma 1, Milano'$$, 1);
reset role;
rollback;
\echo ALL RINK ADDRESS TESTS PASSED
