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
-- The session level, as the token carries it.
create function pg_temp.level(p text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', case when p = '' then '' else jsonb_build_object('aal', p)::text end, true); end $$;

\echo == before the date
select test.login(pg_temp.u('b1'));
select test.rows('the default grace period is about 30 days', $$select 1 from public.club_settings where mfa_required_from > now() + interval '25 days'$$, 1);
select test.affected('the board works without the second step', $$update public.club_settings set name = 'Club' $$, 1);
select test.logout();

\echo == after the date
update public.club_settings set mfa_required_from = now() - interval '1 day';
select test.login(pg_temp.u('b1'));
select pg_temp.level('aal1');
select test.affected('a board session without the second step cannot change the club', $$update public.club_settings set name = 'Altro'$$, 0);
select test.rows('and is not counted as board', $$select 1 where public.is_board()$$, 0);
select test.rows('nor as staff', $$select 1 where public.is_staff()$$, 0);
select test.fails('and cannot give roles', $$insert into public.user_roles values (pg_temp.u('1'), 'coach')$$, 'row-level security');
select pg_temp.level('aal2');
select test.affected('a session that passed the second step can', $$update public.club_settings set name = 'Altro'$$, 1);
select test.rows('and is board', $$select 1 where public.is_board()$$, 1);
select test.works('and can give roles', $$insert into public.user_roles values (pg_temp.u('1'), 'coach')$$);
select test.works('and can move the date', $$update public.club_settings set mfa_required_from = now() + interval '10 days'$$);
select test.logout();
select pg_temp.level('');

\echo == the others
update public.club_settings set mfa_required_from = now() - interval '1 day';
select test.login(pg_temp.u('c1'));
select pg_temp.level('aal1');
select test.rows('a coach is not affected', $$select 1 where public.is_staff()$$, 1);
select test.logout();
select test.login(pg_temp.u('2'));
select pg_temp.level('aal1');
select test.rows('a player is not affected', $$select 1 where public.is_member()$$, 1);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot ask', $$select public.mfa_ok()$$, 'permission denied');
select test.logout();
select pg_temp.level('');

\echo == no date, no rule
update public.club_settings set mfa_required_from = null;
select test.login(pg_temp.u('b1'));
select pg_temp.level('aal1');
select test.rows('with no date the board works as before', $$select 1 where public.is_board()$$, 1);
select test.logout();
select pg_temp.level('');
rollback;
\echo ALL BOARD TWO STEP TESTS PASSED
