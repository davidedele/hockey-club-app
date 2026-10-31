begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id) select g.id, '00000000-0000-0000-0000-000000000001' from public.groups g where g.code = 'A';
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
insert into public.events (id, type, title, starts_at, ends_at, opponent, home_away) values
  (pg_temp.u('a1'), 'game', 'g1', now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 'HC Fanano', 'home');
insert into public.events (id, type, title, starts_at, ends_at) values
  (pg_temp.u('a2'), 'training', 't1', now() - interval '2 days', now() - interval '2 days' + interval '1 hour');
insert into public.event_groups select e.id, g.id from public.events e cross join public.groups g where g.code = 'A';

select test.login(pg_temp.u('c1'));
select test.affected('staff add a video link to a game', $$update public.events set video_url = 'https://www.youtube.com/watch?v=abc' where id = pg_temp.u('a1')$$, 1);
select test.fails('http is refused', $$update public.events set video_url = 'http://example.test/v' where id = pg_temp.u('a1')$$, 'events_video_url_check');
select test.fails('javascript is refused', $$update public.events set video_url = 'javascript:alert(1)' where id = pg_temp.u('a1')$$, 'events_video_url_check');
select test.fails('a space is refused', $$update public.events set video_url = 'https://example.test/a b' where id = pg_temp.u('a1')$$, 'events_video_url_check');
select test.fails('a very long link is refused', $$update public.events set video_url = 'https://example.test/' || repeat('a', 300) where id = pg_temp.u('a1')$$, 'events_video_url_check');
select test.fails('a training cannot have one', $$update public.events set video_url = 'https://example.test/v' where id = pg_temp.u('a2')$$, 'events_video_url_check');
select test.affected('staff clear it', $$update public.events set video_url = null where id = pg_temp.u('a1')$$, 1);
select test.affected('and set it again', $$update public.events set video_url = 'https://example.test/v' where id = pg_temp.u('a1')$$, 1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('a player reads it', $$select 1 from public.events where id = pg_temp.u('a1') and video_url = 'https://example.test/v'$$, 1);
select test.affected('a player cannot change it', $$update public.events set video_url = 'https://example.test/other' where id = pg_temp.u('a1')$$, 0);
select test.logout();
rollback;
\echo ALL MATCH VIDEO TESTS PASSED
