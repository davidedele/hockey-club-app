begin;
create function pg_temp.u(p text) returns uuid language sql as $$select ('00000000-0000-0000-0000-'||lpad(p,12,'0'))::uuid$$;
insert into auth.users(id,email,email_confirmed_at) values(pg_temp.u('c1'),'coach@example.test',now()),(pg_temp.u('1'),'player@example.test',now());
insert into public.profiles(id,first_name,last_name) values(pg_temp.u('c1'),'Cora','Coach'),(pg_temp.u('1'),'Anna','Rossi');
insert into public.user_roles values(pg_temp.u('c1'),'coach');
insert into public.rinks(name,address) values('Address rink','Via Esempio 1, Milano'),('No address rink',null);
create function pg_temp.r(p text) returns smallint language sql as $$select id from public.rinks where name=p$$;
insert into public.events(id,type,title,starts_at,ends_at,venue,rink_id,groups_pending) values
(pg_temp.u('e1'),'training','Training',now()+interval '1 day',now()+interval '1 day 90 minutes','Conflicting address',pg_temp.r('Address rink'),true),
(pg_temp.u('e2'),'training','Training no rink',now()+interval '1 day',now()+interval '1 day 90 minutes','Free address',null,true),
(pg_temp.u('e3'),'training','Training empty rink address',now()+interval '1 day',now()+interval '1 day 90 minutes','Free address',pg_temp.r('No address rink'),true),
(pg_temp.u('e5'),'game','Game',now()+interval '1 day',now()+interval '1 day 90 minutes','Away game address',pg_temp.r('Address rink'),false);
select test.rows('training uses only saved rink address', $$select 1 from public.events where id=pg_temp.u('e1') and venue is null$$,1);
select test.rows('no rink keeps the free address', $$select 1 from public.events where id=pg_temp.u('e2') and venue='Free address'$$,1);
select test.rows('rink without address keeps the free address', $$select 1 from public.events where id=pg_temp.u('e3') and venue='Free address'$$,1);
select test.rows('game retains its explicitly entered venue', $$select 1 from public.events where id=pg_temp.u('e5') and venue='Away game address'$$,1);
select test.login(pg_temp.u('c1'));
select test.affected('staff can correct the training but not add a conflicting address', $$update public.events set venue='Another address' where id=pg_temp.u('e1')$$,1);
select test.rows('staff direct update cannot keep duplicate address', $$select 1 from public.events where id=pg_temp.u('e1') and venue is null$$,1);
select test.affected('selecting an addressed rink clears event address', $$update public.events set rink_id=pg_temp.r('Address rink') where id=pg_temp.u('e2')$$,1);
select test.rows('changed rink has no duplicate event address', $$select 1 from public.events where id=pg_temp.u('e2') and venue is null$$,1);
select test.affected('clearing rink permits an event address again', $$update public.events set rink_id=null,venue='New venue' where id=pg_temp.u('e2')$$,1);
select test.rows('free event address is kept again', $$select 1 from public.events where id=pg_temp.u('e2') and venue='New venue'$$,1);
select test.works('atomic creation cannot bypass canonical training address', $$select public.save_event(null,jsonb_build_object('type','training','title','Atomic addressed training','starts_at',now()+interval '2 days','ends_at',now()+interval '2 days 90 minutes','venue','Wrong address','rink_id',pg_temp.r('Address rink'),'groups_pending',true,'group_ids','[]'::jsonb))$$);
select test.rows('atomic creation stores no duplicate venue', $$select 1 from public.events where title='Atomic addressed training' and venue is null$$,1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.affected('player still cannot change venue', $$update public.events set venue='Forbidden' where id=pg_temp.u('e1')$$,0);
select test.fails('player cannot call the trigger function', $$select public.use_training_rink_address()$$,'permission denied');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot call the trigger function', $$select public.use_training_rink_address()$$,'permission denied');
select test.logout();
rollback;
\echo ALL TRAINING RINK ADDRESS TESTS PASSED
