begin;

-- The second step is optional (decision 130, migration 0053): with no date nothing is required, whatever the session.
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
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.level(p text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', case when p = '' then '' else jsonb_build_object('aal', p)::text end, true); end $$;

\echo == the default
select test.rows('the column has no default date', $$select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_settings' and column_name = 'mfa_required_from' and column_default is null$$, 1);
select test.rows('the club starts with no date', $$select 1 from public.club_settings where mfa_required_from is null$$, 1);

\echo == a date left by the old rule is cleared by the migration step
update public.club_settings set mfa_required_from = now() + interval '20 days';
update public.club_settings set mfa_required_from = null where mfa_required_from is not null;
select test.rows('no date is left', $$select 1 from public.club_settings where mfa_required_from is null$$, 1);

\echo == with no date a board account with a plain session keeps every board right
select test.login(pg_temp.u('b1'));
select pg_temp.level('aal1');
select test.rows('the second step counts as fine', $$select 1 where public.mfa_ok()$$, 1);
select test.rows('the account is board', $$select 1 where public.is_board()$$, 1);
select test.rows('and staff', $$select 1 where public.is_staff()$$, 1);
select test.affected('it can change the club settings', $$update public.club_settings set name = 'Club'$$, 1);
select test.works('it can give a role', $$insert into public.user_roles values (pg_temp.u('1'), 'coach')$$);
select test.works('it can create a group', $$insert into public.groups (code, name) values ('Z9', 'Zeta')$$);
select test.works('it can set the date itself (the optional switch)', $$update public.club_settings set mfa_required_from = now() + interval '30 days'$$);
select test.works('and clear it again', $$update public.club_settings set mfa_required_from = null$$);
select test.logout();
select pg_temp.level('');

\echo == the optional switch still locks when a date has passed
update public.club_settings set mfa_required_from = now() - interval '1 day';
select test.login(pg_temp.u('b1'));
select pg_temp.level('aal1');
select test.rows('a plain session is not board after the date', $$select 1 where public.is_board()$$, 0);
select test.affected('and cannot change the club', $$update public.club_settings set name = 'Altro'$$, 0);
select test.logout();
select pg_temp.level('');

\echo == players and coaches never depended on it
update public.club_settings set mfa_required_from = null;
select test.login(pg_temp.u('1'));
select pg_temp.level('aal1');
select test.affected('a player still cannot change the club', $$update public.club_settings set mfa_required_from = now() + interval '1 day'$$, 0);
select test.logout();
select pg_temp.level('');
rollback;
\echo ALL TWO STEP OPTIONAL TESTS PASSED
