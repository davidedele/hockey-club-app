begin;

-- People: p1 in A, p2 in B, and a signed in user with no profile.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'nobody@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('B', '00000000-0000-0000-0000-000000000002')) v(code, uid)
  join public.groups g on g.code = v.code;

create function pg_temp.season_of(p_at timestamptz) returns integer language sql as $$
  select (extract(year from p_at at time zone 'Europe/Rome') - case when extract(month from p_at at time zone 'Europe/Rome') < 9 then 1 else 0 end)::integer
$$;
create function pg_temp.mk(p_id text, p_type public.event_type, p_days numeric, p_group text, p_for integer, p_against integer, p_opponent text default null) returns void
language plpgsql as $$
declare v_id uuid := ('00000000-0000-0000-0000-' || lpad(p_id, 12, '0'))::uuid;
begin
  insert into public.events (id, type, title, starts_at, ends_at, opponent, home_away, score_for, score_against)
    values (v_id, p_type, p_id, now() + (p_days || ' days')::interval, now() + (p_days || ' days')::interval + interval '1 hour',
            p_opponent, case when p_type = 'game' then 'home' end, p_for, p_against);
  insert into public.event_groups select v_id, id from public.groups where code = p_group;
end $$;
-- Scored games: a1 (A, 4 to 2), a2 (A, 1 to 1), b1 (B, 0 to 3). Not counted: a3 (A, finished with no score),
-- a4 (A, upcoming), a5 (A, a year ago).
select pg_temp.mk('a1', 'game', -3, 'A', 4, 2, 'Lions');
select pg_temp.mk('a2', 'game', -2, 'A', 1, 1, 'Bears');
select pg_temp.mk('b1', 'game', -1, 'B', 0, 3, 'Wolves');
select pg_temp.mk('a3', 'game', -0.5, 'A', null, null, 'Owls');
select pg_temp.mk('a4', 'game', 2, 'A', null, null, 'Hawks');
select pg_temp.mk('a5', 'game', -400, 'A', 2, 0, 'Old');

\echo == who may read
select test.login_anon();
select test.fails('anonymous cannot read the results', $$select * from public.season_results(pg_temp.season_of(now() - interval '3 days'))$$, 'permission denied');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000009');
select test.rows('someone without a profile sees nothing', $$select * from public.season_results(pg_temp.season_of(now() - interval '3 days'))$$, 0);
select test.logout();

\echo == the results
select test.login('00000000-0000-0000-0000-000000000001');
select test.rows('a member sees the three scored games of the season', $$select * from public.season_results(pg_temp.season_of(now() - interval '3 days'))$$, 3);
select test.rows('a member sees the games of every group', $$select * from public.season_results(pg_temp.season_of(now() - interval '3 days')) where opponent = 'Wolves' and score_for = 0 and score_against = 3$$, 1);
select test.rows('oldest first', $$select 1 from (select opponent, row_number() over () rn from public.season_results(pg_temp.season_of(now() - interval '3 days'))) x where (rn = 1 and opponent = 'Lions') or (rn = 2 and opponent = 'Bears') or (rn = 3 and opponent = 'Wolves')$$, 3);
select test.rows('a game with no score is left out', $$select * from public.season_results(pg_temp.season_of(now() - interval '3 days')) where opponent = 'Owls'$$, 0);
select test.rows('an upcoming game is left out', $$select * from public.season_results(pg_temp.season_of(now() - interval '3 days')) where opponent = 'Hawks'$$, 0);
select test.rows('a game of another season is left out', $$select * from public.season_results(pg_temp.season_of(now() - interval '3 days')) where opponent = 'Old'$$, 0);
select test.rows('the earlier season has its own game', $$select * from public.season_results(pg_temp.season_of(now() - interval '400 days')) where opponent = 'Old' and score_for = 2$$, 1);
select test.rows('group A has two games', $$select * from public.season_results(pg_temp.season_of(now() - interval '3 days'), (select id from public.groups where code = 'A'))$$, 2);
select test.rows('group B has one game', $$select * from public.season_results(pg_temp.season_of(now() - interval '3 days'), (select id from public.groups where code = 'B')) where opponent = 'Wolves'$$, 1);
select test.rows('group C1 has none', $$select * from public.season_results(pg_temp.season_of(now() - interval '3 days'), (select id from public.groups where code = 'C1'))$$, 0);
select test.rows('the home or away mark is given', $$select * from public.season_results(pg_temp.season_of(now() - interval '3 days')) where home_away = 'home'$$, 3);
select test.logout();

rollback;
