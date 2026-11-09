begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000c1','coach@example.test',now()),
 ('00000000-0000-0000-0000-000000000001','a@example.test',now()),
 ('00000000-0000-0000-0000-000000000002','c@example.test',now()),
 ('00000000-0000-0000-0000-000000000003','empty@example.test',now());
insert into public.profiles(id,first_name,last_name) values
 ('00000000-0000-0000-0000-0000000000c1','Cora','Coach'),
 ('00000000-0000-0000-0000-000000000001','Anna','Rossi'),
 ('00000000-0000-0000-0000-000000000002','Carlo','Verdi');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000c1','coach');
insert into public.group_members(group_id,user_id) select g.id,v.uid::uuid from (values
 ('A','00000000-0000-0000-0000-000000000001'),('C1','00000000-0000-0000-0000-000000000002')) v(code,uid)
 join public.groups g on g.code=v.code;
create function pg_temp.u(p text) returns uuid language sql as $$select ('00000000-0000-0000-0000-'||lpad(p,12,'0'))::uuid$$;
insert into public.events(id,type,title,starts_at,ends_at,series_id) values
 (pg_temp.u('e0'),'training','Historical',now()-interval '10 days',now()-interval '10 days'+interval '90 minutes',pg_temp.u('aa')),
 (pg_temp.u('e1'),'training','Training',now()+interval '2 days',now()+interval '2 days 90 minutes',pg_temp.u('aa')),
 (pg_temp.u('e2'),'training','Training',now()+interval '9 days',now()+interval '9 days 90 minutes',pg_temp.u('aa')),
 (pg_temp.u('e3'),'training','Training',now()+interval '16 days',now()+interval '16 days 90 minutes',pg_temp.u('aa')),
 (pg_temp.u('b0'),'game','Game',now()-interval '2 days',now()-interval '2 days'+interval '90 minutes',null);
insert into public.event_groups select e.id,g.id from public.events e cross join public.groups g where g.code='A';
insert into public.attendance_answers(event_id,user_id,answer) values(pg_temp.u('e1'),pg_temp.u('1'),'present');
insert into public.event_lineup(event_id,slot,unit,user_id) values(pg_temp.u('e1'),'centre',1,pg_temp.u('1'));
insert into public.event_plan(event_id,notes,visible_after) values(pg_temp.u('e1'),'Private training plan',false);
insert into public.event_messages(event_id,user_id,body) values(pg_temp.u('e1'),pg_temp.u('1'),'Team discussion');
insert into public.game_stats(event_id,user_id,goals) values(pg_temp.u('b0'),pg_temp.u('1'),2);
create function pg_temp.changes(p_id uuid) returns jsonb language sql as $$
 select jsonb_build_object('type',e.type,'title',e.title,'starts_at',e.starts_at,'ends_at',e.ends_at,
 'meetup_at',e.meetup_at,'venue',e.venue,'rink_id',e.rink_id,'opponent',e.opponent,'home_away',e.home_away,
 'jersey',e.jersey,'video_url',e.video_url,'groups_pending',e.groups_pending,
 'group_ids',(select coalesce(jsonb_agg(eg.group_id),'[]') from public.event_groups eg where eg.event_id=e.id),
 'participant_details',e.participant_details,'observer_details',e.observer_details) from public.events e where e.id=p_id
$$;

select test.login(pg_temp.u('2'));
select test.rows('another group sees all five calendar entries', 'select * from public.events',5);
select test.rows('another group sees the assigned team', $$select * from public.event_groups where event_id=pg_temp.u('e1')$$,1);
select test.rows('calendar consultation does not widen the participation helper', $$select 1 where public.can_see_event(pg_temp.u('e1'))$$,0);
select test.rows('other group has no lineup by default', $$select * from public.event_lineup$$,0);
select test.rows('other group has no plan by default', $$select * from public.event_plan$$,0);
select test.rows('other group has no discussion by default', $$select * from public.event_messages$$,0);
select test.rows('other group has no attendance names by default', $$select * from public.event_present_people(pg_temp.u('e1'))$$,0);
select test.rows('other group has no attendance count by default', $$select * from public.event_present_counts(array[pg_temp.u('e1')])$$,0);
select test.rows('other group has no game rows by default', $$select * from public.game_stats$$,0);
select test.rows('other group has no game result function by default', $$select * from public.game_results(pg_temp.u('b0'))$$,0);
select test.fails('consultation cannot answer', $$select public.answer_attendance(pg_temp.u('e1'),'present')$$,'forbidden');
select test.fails('consultation cannot send a message', $$select public.post_event_message(pg_temp.u('e1'),'Not allowed')$$,'forbidden');
select test.fails('consultation cannot change a series', $$select public.save_event(pg_temp.u('e1'),pg_temp.changes(pg_temp.u('e1')))$$,'forbidden');
select test.fails('consultation cannot delete', $$select public.manage_events(pg_temp.u('e1'),'one','delete',1)$$,'forbidden');
select test.fails('consultation cannot preview staff actions', $$select * from public.event_scope(pg_temp.u('e1'))$$,'forbidden');
select test.affected('consultation cannot change events directly', $$update public.events set title='Forbidden'$$,0);
select test.affected('consultation cannot delete events directly', $$delete from public.events$$,0);
select test.logout();

update public.events set observer_details=array['presence','lineup','plan','discussion','game'];
select test.login(pg_temp.u('2'));
select test.rows('optional lineup opens when enabled', 'select * from public.event_lineup',1);
select test.rows('optional plan opens when enabled', 'select * from public.event_plan',1);
select test.rows('optional discussion opens when enabled', 'select * from public.event_messages',1);
select test.rows('optional attendance names open when enabled', $$select * from public.event_present_people(pg_temp.u('e1'))$$,1);
select test.rows('optional attendance count opens when enabled', $$select * from public.event_present_counts(array[pg_temp.u('e1')]) where present=1$$,1);
select test.rows('optional statistics open when enabled', 'select * from public.game_stats',1);
select test.rows('optional game results open when enabled', $$select * from public.game_results(pg_temp.u('b0'))$$,1);
select test.logout();
insert into public.attendance_records(event_id,user_id,status) values(pg_temp.u('b0'),pg_temp.u('2'),'on_time');
select test.login(pg_temp.u('2'));
select test.fails('historical attendance cannot grant a vote to another group', $$select public.submit_game_vote(pg_temp.u('b0'),pg_temp.u('1'),'[]')$$,'forbidden');
select test.fails('visible discussion is still read only', $$select public.post_event_message(pg_temp.u('e1'),'Not allowed')$$,'forbidden');
select test.fails('observer cannot create a read receipt', $$select public.mark_event_seen(pg_temp.u('e1'))$$,'forbidden');
select test.rows('observer discussion creates no notification', 'select * from public.my_event_threads()',0);
select test.fails('visible details never grant attendance', $$select public.answer_attendance(pg_temp.u('e1'),'absent')$$,'forbidden');
select test.logout();
update public.events set participant_details='{}';
select test.login(pg_temp.u('1'));
select test.rows('participant lineup can be hidden independently', 'select * from public.event_lineup',0);
select test.rows('participant plan can be hidden independently', 'select * from public.event_plan',0);
select test.rows('participant discussion can be hidden independently', 'select * from public.event_messages',0);
select test.rows('participant attendance can be hidden independently', $$select * from public.event_present_people(pg_temp.u('e1'))$$,0);
select test.rows('participant game details can be hidden independently', 'select * from public.game_stats',0);
select test.fails('hidden discussion cannot be posted to', $$select public.post_event_message(pg_temp.u('e1'),'Hidden')$$,'forbidden');
select test.works('hiding details does not remove attendance eligibility', $$select public.answer_attendance(pg_temp.u('e1'),'absent')$$);
select test.logout();
insert into public.attendance_records(event_id,user_id,status) values(pg_temp.u('e1'),pg_temp.u('1'),'not_called_up');
select test.login(pg_temp.u('1'));
select test.fails('not called up cannot answer', $$select public.answer_attendance(pg_temp.u('e1'),'present')$$,'not_in_event');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.rows('staff always see lineup', 'select * from public.event_lineup',1);
select test.rows('staff always see plan', 'select * from public.event_plan',1);
select test.rows('staff always see discussion', 'select * from public.event_messages',1);
select test.rows('staff always see statistics', 'select * from public.game_stats',1);
select test.rows('following scope starts at selected event', $$select * from public.event_scope(pg_temp.u('e2'),'following')$$,2);
select test.rows('whole future scope leaves history alone', $$select * from public.event_scope(pg_temp.u('e2'),'future')$$,3);
select test.fails('bad scope refused', $$select * from public.event_scope(pg_temp.u('e1'),'everything')$$,'scope_invalid');
select test.fails('stale count refuses save', $$select public.save_event(pg_temp.u('e2'),pg_temp.changes(pg_temp.u('e2')),'following',0,99)$$,'event_scope_changed');
select test.fails('invalid groups refuse the whole edit', $$select public.save_event(pg_temp.u('e1'),pg_temp.changes(pg_temp.u('e1'))||'{"title":"Must not save","group_ids":[999]}')$$,'groups_required');
select test.rows('failed edit did not save the title', $$select * from public.events where title='Must not save'$$,0);
select test.fails('no implicit group removal', $$select public.save_event(pg_temp.u('e1'),pg_temp.changes(pg_temp.u('e1'))||'{"group_ids":[]}')$$,'groups_required');
select test.works('explicit pending training saves with no teams', $$select public.save_event(pg_temp.u('e1'),pg_temp.changes(pg_temp.u('e1'))||'{"group_ids":[],"groups_pending":true}')$$);
select test.rows('pending training has no group rows', $$select * from public.event_groups where event_id=pg_temp.u('e1')$$,0);
select test.rows('pending removes previous answers', $$select * from public.attendance_answers where event_id=pg_temp.u('e1')$$,0);
select test.rows('pending removes previous attendance records', $$select * from public.attendance_records where event_id=pg_temp.u('e1')$$,0);
select test.rows('unassigned event creates no attendance request for its former member', $$select * from public.unanswered_people(30) where user_id=pg_temp.u('1') and missing<>2$$,0);
select test.rows('pending removes previous lineup', $$select * from public.event_lineup where event_id=pg_temp.u('e1')$$,0);
select test.works('teams can be assigned later', $$select public.save_event(pg_temp.u('e1'),pg_temp.changes(pg_temp.u('e1'))||jsonb_build_object('groups_pending',false,'group_ids',array[(select id from public.groups where code='C1')]))$$);
select test.rows('later assignment clears the pending state', $$select * from public.events where id=pg_temp.u('e1') and not groups_pending$$,1);
select test.rows('later assignment has the right team', $$select * from public.event_groups eg join public.groups g on g.id=eg.group_id where eg.event_id=pg_temp.u('e1') and g.code='C1'$$,1);
select test.logout();
select test.login(pg_temp.u('2'));
select test.works('newly assigned member can answer', $$select public.answer_attendance(pg_temp.u('e1'),'present')$$);
select test.logout();
select test.login(pg_temp.u('c1'));
select test.works('series time and detail settings change together', $$select public.save_event(pg_temp.u('e2'),pg_temp.changes(pg_temp.u('e2'))||jsonb_build_object('title','New series','starts_at',(select starts_at+interval '15 minutes' from public.events where id=pg_temp.u('e2')),'ends_at',(select ends_at+interval '15 minutes' from public.events where id=pg_temp.u('e2')),'observer_details',array['lineup']),'following',0,2)$$);
select test.rows('only two later events changed', $$select * from public.events where title='New series' and observer_details=array['lineup']$$,2);
select test.rows('history remains unchanged', $$select * from public.events where id=pg_temp.u('e0') and title='Historical'$$,1);
select test.logout();
create function pg_temp.reject_series_update() returns trigger language plpgsql as $$
begin
  if new.id=pg_temp.u('e3') and new.title='Rollback series' then raise exception 'blocked occurrence'; end if;
  return new;
end
$$;
create trigger test_reject_series before update on public.events for each row execute function pg_temp.reject_series_update();
select test.login(pg_temp.u('c1'));
select test.fails('a failure on the second occurrence rolls back the whole series', $$select public.save_event(pg_temp.u('e2'),pg_temp.changes(pg_temp.u('e2'))||'{"title":"Rollback series"}','following',0,2)$$,'blocked occurrence');
select test.rows('no earlier occurrence was partly saved', $$select * from public.events where title='Rollback series'$$,0);
select test.rows('both original titles remain after the refused series edit', $$select * from public.events where title='New series'$$,2);
select test.fails('stale count refuses deletion', $$select public.manage_events(pg_temp.u('e2'),'following','delete',99)$$,'event_scope_changed');
select test.works('cancel following occurrences', $$select public.manage_events(pg_temp.u('e2'),'following','cancel',2)$$);
select test.rows('cancelled events stay stored', $$select * from public.events where cancelled_at is not null$$,2);
select test.works('restore all future occurrences', $$select public.manage_events(pg_temp.u('e2'),'future','restore',3)$$);
select test.rows('restored events are active', $$select * from public.events where cancelled_at is not null$$,0);
select test.fails('invalid action refuses all changes', $$select public.manage_events(pg_temp.u('e2'),'future','other',3)$$,'event_invalid');
select test.fails('a game cannot be pending', $$select public.save_event(pg_temp.u('b0'),pg_temp.changes(pg_temp.u('b0'))||'{"groups_pending":true,"group_ids":[]}')$$,'groups_required');
select test.fails('unknown detail is refused', $$select public.save_event(pg_temp.u('e2'),pg_temp.changes(pg_temp.u('e2'))||'{"observer_details":["contacts"]}')$$,'check constraint');
select test.rows('invalid visibility rolled back', $$select * from public.events where observer_details @> array['contacts']$$,0);
-- Create a real series across the next spring clock change, keeping local clock times.
select test.works('new pending series across daylight saving', $$select public.save_event(null,jsonb_build_object('type','training','title','Spring series',
 'starts_at',make_timestamptz(extract(year from now())::int+1,3,17,22,30,0,'Europe/Rome'),
 'ends_at',make_timestamptz(extract(year from now())::int+1,3,18,0,0,0,'Europe/Rome'),
 'meetup_at',make_timestamptz(extract(year from now())::int+1,3,17,21,30,0,'Europe/Rome'),
 'groups_pending',true,'group_ids','[]'::jsonb),'one',3)$$);
select test.rows('new series has four pending events and shared settings', $$select * from public.events where title='Spring series' and groups_pending and cardinality(participant_details)=5$$,4);
select test.rows('spring series keeps local start and overnight end', $$select * from public.events where title='Spring series' and (starts_at at time zone 'Europe/Rome')::time='22:30' and (ends_at at time zone 'Europe/Rome')::time='00:00' and ends_at-starts_at=interval '90 minutes'$$,4);
select test.works('older group API can assign a pending training', $$select public.set_event_groups((select id from public.events where title='Spring series' order by starts_at limit 1),array[(select id from public.groups where code='A')]::smallint[],'one')$$);
select test.rows('older group API clears pending only on assigned occurrence', $$select * from public.events where title='Spring series' and not groups_pending$$,1);
select test.works('new game creation stores jersey and video in one operation', $$select public.save_event(null,jsonb_build_object('type','game','title','New game', 'starts_at',now()+interval '10 days','ends_at',now()+interval '10 days 2 hours','opponent','Other team','home_away','home','jersey','light','video_url','https://example.test/game','group_ids',array[(select id from public.groups where code='A')]))$$);
select test.rows('new game has its details immediately', $$select * from public.events where title='New game' and jersey='light' and video_url='https://example.test/game'$$,1);
select test.works('delete future series from the middle', $$select public.manage_events(pg_temp.u('e2'),'future','delete',3)$$);
select test.rows('future series deleted but historical occurrence preserved', $$select * from public.events where series_id=pg_temp.u('aa')$$,1);
select test.logout();
select test.login(pg_temp.u('1'));
select test.rows('all unassigned spring events are consultable', $$select * from public.events where title='Spring series'$$,4);
select test.fails('unassigned training cannot be answered', $$select public.answer_attendance((select id from public.events where title='Spring series' and groups_pending limit 1),'present')$$,'forbidden');
select test.logout();
select test.login(pg_temp.u('3'));
select test.rows('account without membership cannot read club calendar', 'select * from public.events',0);
select test.rows('account without membership cannot read detail', $$select 1 where public.event_detail_allowed(pg_temp.u('b0'),'game')$$,0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot preview series', $$select * from public.event_scope(pg_temp.u('b0'))$$,'permission denied');
select test.fails('anonymous cannot inspect detail permissions', $$select public.event_detail_allowed(pg_temp.u('b0'),'game')$$,'permission denied');
select test.fails('anonymous cannot save', $$select public.save_event(null,'{}')$$,'permission denied');
select test.fails('anonymous cannot manage events', $$select public.manage_events(pg_temp.u('b0'),'one','delete',1)$$,'permission denied');
select test.logout();
rollback;
\echo ALL EVENT MANAGEMENT TESTS PASSED
