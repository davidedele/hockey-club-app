begin;

-- People: board1 and coach1 with no group, p1 in A, p2 in B, p4 in C1.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.test', now()),
  -- Signed in but not a member of the club: no profile, no group.
  ('00000000-0000-0000-0000-00000000000f', 'stranger@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two'),
  ('00000000-0000-0000-0000-000000000004', 'Pit', 'Four');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('B', '00000000-0000-0000-0000-000000000002'),
    ('C1', '00000000-0000-0000-0000-000000000004')) v(code, uid)
  join public.groups g on g.code = v.code;

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.mk(p_id text, p_hours integer, p_group text) returns void
language plpgsql as $$
declare v_start timestamptz := now() + (p_hours || ' hours')::interval;
begin
  insert into public.events (id, type, title, starts_at, ends_at)
    values (pg_temp.u(p_id), 'training', p_id, v_start, v_start + interval '1 hour');
  insert into public.event_groups select pg_temp.u(p_id), id from public.groups where code = p_group;
end $$;

-- e1 is to come, e0 is over and its plan is hidden afterwards, e9 is over and its plan stays up.
select pg_temp.mk('e1', 48, 'A');
select pg_temp.mk('e0', -48, 'A');
select pg_temp.mk('e9', -72, 'A');
-- d1 and d2 are in the library before the tests start.
insert into public.drills (id, title, notes) values
  (pg_temp.u('d1'), 'Passaggi', 'In coppia'),
  (pg_temp.u('d2'), 'Tiri', null);

\echo == the drill library
select test.login(pg_temp.u('1'));
select test.rows('a player reads the library', $$select 1 from public.drills$$, 2);
select test.fails('a player cannot add a drill', $$insert into public.drills (title) values ('Mio')$$, 'row-level security');
select test.affected('a player cannot change a drill', $$update public.drills set title = 'Mio' where id = pg_temp.u('d1')$$, 0);
select test.affected('a player cannot remove a drill', $$delete from public.drills where id = pg_temp.u('d1')$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous reads no drills', $$select 1 from public.drills$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('f'));
select test.rows('somebody signed in who is not in the club reads no drills', $$select 1 from public.drills$$, 0);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.works('a coach adds a drill', $$insert into public.drills (id, title, notes) values (pg_temp.u('d3'), 'Uno contro uno', 'Metà pista')$$);
select test.works('a coach adds a drill with a video', $$insert into public.drills (title, video_url) values ('Video', 'https://example.test/v')$$);
select test.fails('an empty title is refused', $$insert into public.drills (title) values ('   ')$$, 'drills_title_check');
select test.fails('a link that is not https is refused', $$insert into public.drills (title, video_url) values ('X', 'javascript:alert(1)')$$, 'drills_video_url_check');
select test.fails('a file somewhere else is refused', $$insert into public.drills (title, file_path) values ('X', '../secret.pdf')$$, 'drills_file_path_check');
select test.affected('a coach changes a drill', $$update public.drills set notes = 'Tutta la pista' where id = pg_temp.u('d3')$$, 1);
select test.logout();

\echo == who may write a plan
select test.login(pg_temp.u('1'));
select test.fails('a player cannot start a plan', $$insert into public.event_plan (event_id) values (pg_temp.u('e1'))$$, 'row-level security');
select test.fails('a player cannot put a drill in a plan', $$select public.add_plan_drill(pg_temp.u('e1'), pg_temp.u('d1'))$$, 'forbidden');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.works('a coach puts a drill in a plan', $$select public.add_plan_drill(pg_temp.u('e1'), pg_temp.u('d1'))$$);
select test.rows('the plan was started by itself', $$select 1 from public.event_plan where event_id = pg_temp.u('e1')$$, 1);
select test.rows('the coach is written down as the one who changed it', $$select 1 from public.event_plan where event_id = pg_temp.u('e1') and updated_by = pg_temp.u('c1')$$, 1);
select test.works('a second drill goes after the first', $$select public.add_plan_drill(pg_temp.u('e1'), pg_temp.u('d2'))$$);
select test.works('a third one too', $$select public.add_plan_drill(pg_temp.u('e1'), pg_temp.u('d3'))$$);
select test.rows('the steps are one, two and three', $$select 1 from public.event_plan_drills where event_id = pg_temp.u('e1') and step in (1, 2, 3)$$, 3);
select test.fails('a drill cannot go in the plan of an event that does not exist', $$select public.add_plan_drill(pg_temp.u('ff'), pg_temp.u('d1'))$$, 'not_found');
select test.affected('a coach writes the words of the session', $$update public.event_plan set notes = 'Scarico, poi tiri' where event_id = pg_temp.u('e1')$$, 1);
select test.logout();

\echo == moving the drills around
select test.login(pg_temp.u('c1'));
select test.works('the second drill moves up', $$select public.move_plan_drill((select id from public.event_plan_drills where event_id = pg_temp.u('e1') and drill_id = pg_temp.u('d2')), true)$$);
select test.rows('it is now the first', $$select 1 from public.event_plan_drills where event_id = pg_temp.u('e1') and drill_id = pg_temp.u('d2') and step = 1$$, 1);
select test.rows('the one it passed is now the second', $$select 1 from public.event_plan_drills where event_id = pg_temp.u('e1') and drill_id = pg_temp.u('d1') and step = 2$$, 1);
select test.works('moving the first one up changes nothing', $$select public.move_plan_drill((select id from public.event_plan_drills where event_id = pg_temp.u('e1') and drill_id = pg_temp.u('d2')), true)$$);
select test.rows('it is still the first', $$select 1 from public.event_plan_drills where event_id = pg_temp.u('e1') and drill_id = pg_temp.u('d2') and step = 1$$, 1);
select test.works('the first one moves down', $$select public.move_plan_drill((select id from public.event_plan_drills where event_id = pg_temp.u('e1') and drill_id = pg_temp.u('d2')), false)$$);
select test.rows('it is the second again', $$select 1 from public.event_plan_drills where event_id = pg_temp.u('e1') and drill_id = pg_temp.u('d2') and step = 2$$, 1);
select test.rows('no two drills share a step', $$select 1 from (select step from public.event_plan_drills where event_id = pg_temp.u('e1') group by step having count(*) > 1) x$$, 0);
select test.fails('a drill of no plan cannot be moved', $$select public.move_plan_drill(pg_temp.u('ff'), true)$$, 'not_found');
select test.logout();
select test.login(pg_temp.u('1'));
select test.fails('a player cannot move a drill', $$select public.move_plan_drill((select id from public.event_plan_drills where event_id = pg_temp.u('e1') limit 1), true)$$, 'forbidden');
select test.logout();
-- The step rule waits for the end of the statement so a swap can happen. Asking for it at once
-- here shows that it is really there.
set constraints all immediate;
select test.login(pg_temp.u('c1'));
select test.fails('two drills cannot share a step', $$insert into public.event_plan_drills (event_id, drill_id, step) values (pg_temp.u('e1'), pg_temp.u('d2'), 1)$$, 'event_plan_drills_step_key');
select test.logout();
set constraints all deferred;

\echo == who may read a plan
select test.login(pg_temp.u('1'));
select test.rows('a player of the group reads the plan before the session', $$select 1 from public.event_plan where event_id = pg_temp.u('e1')$$, 1);
select test.rows('and the drills in it', $$select 1 from public.event_plan_drills where event_id = pg_temp.u('e1')$$, 3);
select test.affected('a player cannot change the words', $$update public.event_plan set notes = 'Mio' where event_id = pg_temp.u('e1')$$, 0);
select test.affected('a player cannot leave the plan up after the session', $$update public.event_plan set visible_after = true where event_id = pg_temp.u('e1')$$, 0);
select test.logout();
select test.login(pg_temp.u('2'));
select test.rows('somebody outside the groups reads nothing', $$select 1 from public.event_plan where event_id = pg_temp.u('e1')$$, 0);
select test.logout();

\echo == after the session
select test.login(pg_temp.u('c1'));
select test.works('a plan for a past session', $$select public.add_plan_drill(pg_temp.u('e0'), pg_temp.u('d1'))$$);
select test.works('and one that stays visible', $$select public.add_plan_drill(pg_temp.u('e9'), pg_temp.u('d1'))$$);
select test.affected('the coach leaves the second one up', $$update public.event_plan set visible_after = true where event_id = pg_temp.u('e9')$$, 1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('the hidden plan of a past session is gone for the player', $$select 1 from public.event_plan where event_id = pg_temp.u('e0')$$, 0);
select test.rows('its drills are gone too', $$select 1 from public.event_plan_drills where event_id = pg_temp.u('e0')$$, 0);
select test.rows('the one left up is still there', $$select 1 from public.event_plan where event_id = pg_temp.u('e9')$$, 1);
select test.rows('with its drills', $$select 1 from public.event_plan_drills where event_id = pg_temp.u('e9')$$, 1);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('the coach still sees every plan', $$select 1 from public.event_plan$$, 3);
select test.logout();

\echo == a full plan
insert into public.event_plan_drills (event_id, drill_id, step)
  select pg_temp.u('e1'), pg_temp.u('d1'), g from generate_series(4, 30) g;
select test.login(pg_temp.u('c1'));
select test.rows('thirty drills fit', $$select 1 from public.event_plan_drills where event_id = pg_temp.u('e1')$$, 30);
select test.fails('the thirty first does not', $$select public.add_plan_drill(pg_temp.u('e1'), pg_temp.u('d2'))$$, 'plan_full');
select test.logout();

\echo == what happens when things are removed
select test.login(pg_temp.u('c1'));
select test.affected('a coach takes a drill out of a plan', $$delete from public.event_plan_drills where event_id = pg_temp.u('e9')$$, 1);
select test.affected('a coach removes a drill from the library', $$delete from public.drills where id = pg_temp.u('d1')$$, 1);
select test.rows('it is gone from the plans that used it', $$select 1 from public.event_plan_drills where drill_id = pg_temp.u('d1')$$, 0);
select test.logout();
delete from public.events where id = pg_temp.u('e1');
select test.login(pg_temp.u('c1'));
select test.rows('a deleted event takes its plan with it', $$select 1 from public.event_plan where event_id = pg_temp.u('e1')$$, 0);
select test.rows('and the drills of that plan', $$select 1 from public.event_plan_drills where event_id = pg_temp.u('e1')$$, 0);
select test.logout();
