begin;

-- People: board1 (board), coach1 (coach), p1, p2, p3 and goalie p5 in A, p4 in C1,
-- and u9, who signed up but never joined with an invite.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.test', now()),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.test', now()),
  ('00000000-0000-0000-0000-000000000005', 'p5@example.test', now()),
  ('00000000-0000-0000-0000-000000000009', 'u9@example.test', now());
insert into public.profiles (id, first_name, last_name, position) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board', null),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach', null),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One', 'forward'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two', 'defence'),
  ('00000000-0000-0000-0000-000000000003', 'Pip', 'Three', 'forward'),
  ('00000000-0000-0000-0000-000000000004', 'Pat', 'Four', 'forward'),
  ('00000000-0000-0000-0000-000000000005', 'Gil', 'Five', 'goalie');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select g.id, v.uid::uuid from (values
    ('A', '00000000-0000-0000-0000-000000000001'),
    ('A', '00000000-0000-0000-0000-000000000002'),
    ('A', '00000000-0000-0000-0000-000000000003'),
    ('A', '00000000-0000-0000-0000-000000000005'),
    ('C1', '00000000-0000-0000-0000-000000000004')) v(code, uid)
  join public.groups g on g.code = v.code;

-- g1: a game of A two days ago. g2: a game of A in two days. t1: a training of A two days ago.
insert into public.events (id, type, title, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'game', 'g1', now() - interval '2 days', now() - interval '2 days' + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000a2', 'game', 'g2', now() + interval '2 days', now() + interval '2 days 2 hours'),
  ('00000000-0000-0000-0000-0000000000a3', 'training', 't1', now() - interval '2 days', now() - interval '2 days' + interval '1 hour');
insert into public.event_groups
  select e, g.id from unnest(array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2',
                                   '00000000-0000-0000-0000-0000000000a3']::uuid[]) e
  cross join public.groups g where g.code = 'A';
-- In g1: p1 and p2 said present; p3 said present but was recorded excused; p5 was recorded on time.
insert into public.attendance_answers (event_id, user_id, answer) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'present'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002', 'present'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000003', 'present'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', 'present'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000002', 'present');
insert into public.attendance_records (event_id, user_id, status) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000003', 'excused'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000005', 'on_time');

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.season() returns integer language sql as
  $$ select extract(year from (now() - interval '2 days') at time zone 'Europe/Rome' - interval '8 months')::integer $$;
grant usage on schema test to authenticated, service_role;

-- p1 is the person to delete: contact, certificate, absence, phone, choices, a calendar link, numbers, a vote, a message.
update public.profiles set jersey_number = 17, position = 'forward', avatar_path = pg_temp.u('1')::text || '/avatar-2000000000.jpg' where id = pg_temp.u('1');
insert into public.profile_contacts (user_id, email, phone) values (pg_temp.u('1'), 'pia@example.test', '3331234567') on conflict (user_id) do update set phone = '3331234567';
insert into public.member_documents (user_id, kind, file_path) values (pg_temp.u('1'), 'medical_certificate', pg_temp.u('1')::text || '/medical_certificate-2000000000.pdf');
insert into public.absence_periods (user_id, starts_on, ends_on) values (pg_temp.u('1'), current_date + 5, current_date + 9);
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.u('1'), 'https://push.example/x', repeat('p', 30), repeat('a', 12));
insert into public.notification_prefs values (pg_temp.u('1'), 'changes', 'both');
insert into public.reminder_prefs (user_id, enabled) values (pg_temp.u('1'), false);
insert into public.calendar_tokens (user_id, token) values (pg_temp.u('1'), repeat('c', 64));
insert into public.event_messages (event_id, user_id, body) values (pg_temp.u('a1'), pg_temp.u('1'), 'Ciao a tutti');
insert into public.game_stats (event_id, user_id, goals, assists) values (pg_temp.u('a1'), pg_temp.u('1'), 2, 1);
insert into public.attendance_records (event_id, user_id, status) values (pg_temp.u('a1'), pg_temp.u('1'), 'on_time');
insert into public.mvp_votes (event_id, voter_id, voted_id) values (pg_temp.u('a1'), pg_temp.u('1'), pg_temp.u('2'));
insert into public.invites (group_id, token_hash, created_by) values ((select id from public.groups where code = 'A'), '\x01', pg_temp.u('1'));
create temp table before as select * from public.season_player_stats(2026, null) where false;
grant select, insert on before to authenticated;

select test.login(pg_temp.u('2'));
insert into before select * from public.season_player_stats(pg_temp.season(), null) where user_id = pg_temp.u('1');
select test.rows('the numbers of the person are there before', $$select 1 from before where goals = 2 and assists = 1$$, 1);
select test.logout();
\echo == who may delete
select test.login(pg_temp.u('1'));
select test.fails('a player cannot delete a member', $$select public.delete_member_data(pg_temp.u('2'))$$, 'forbidden');
select test.logout();
select test.login(pg_temp.u('c1'));
select test.fails('a coach cannot delete a member', $$select public.delete_member_data(pg_temp.u('1'))$$, 'forbidden');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot delete a member', $$select public.delete_member_data(pg_temp.u('1'))$$, 'permission denied');
select test.logout();
select test.login(pg_temp.u('b1'));
select test.fails('the board cannot delete itself', $$select public.delete_member_data(pg_temp.u('b1'))$$, 'cannot_delete_self');
select test.fails('an unknown person is refused', $$select public.delete_member_data(pg_temp.u('77'))$$, 'not_found');
select test.logout();

\echo == the deletion
select test.login(pg_temp.u('b1'));
select test.works('the board deletes a member', $$select public.delete_member_data(pg_temp.u('1'))$$);
select test.fails('it cannot be done twice', $$select public.delete_member_data(pg_temp.u('1'))$$, 'already_deleted');
select test.rows('the name is replaced', $$select 1 from public.profiles where id = pg_temp.u('1') and first_name = 'Utente' and last_name = 'Eliminato' and jersey_number is null and position is null and avatar_path is null and deleted_at is not null$$, 1);
select test.rows('no contact is left', $$select 1 from public.profile_contacts where user_id = pg_temp.u('1')$$, 0);
select test.rows('no document is left', $$select 1 from public.member_documents where user_id = pg_temp.u('1')$$, 0);
select test.rows('no absence is left', $$select 1 from public.absence_periods where user_id = pg_temp.u('1')$$, 0);
select test.rows('no memberships are left', $$select 1 from public.group_members where user_id = pg_temp.u('1')$$, 0);
select test.rows('no phone is left', $$select 1 from public.push_subscriptions where user_id = pg_temp.u('1')$$, 0);
select test.rows('no notification choice is left', $$select 1 from public.notification_prefs where user_id = pg_temp.u('1')$$, 0);
select test.rows('no email switch is left', $$select 1 from public.reminder_prefs where user_id = pg_temp.u('1')$$, 0);
select test.rows('no calendar link is left', $$select 1 from public.calendar_tokens where user_id = pg_temp.u('1')$$, 0);
select test.rows('the invite they made is revoked', $$select 1 from public.invites where created_by = pg_temp.u('1') and revoked_at is not null$$, 1);
select test.rows('a small record was kept, with no person in it', $$select 1 from public.member_deletions where deleted_by = pg_temp.u('b1')$$, 1);
select test.rows('the record has nothing about the person', $$select 1 from information_schema.columns where table_name = 'member_deletions' and column_name in ('user_id', 'person_id', 'first_name', 'email')$$, 0);
select test.rows('the statistics totals did not change', $$select 1 from public.season_player_stats(pg_temp.season(), null) s join before b on b.user_id = s.user_id where s.goals = b.goals and s.assists = b.assists and s.games = b.games and s.mvp = b.mvp$$, 1);
select test.rows('the attendance record stays on the anonymous profile', $$select 1 from public.attendance_records where user_id = pg_temp.u('1')$$, 1);
select test.rows('the message stays, with the anonymous author', $$select 1 from public.event_messages m join public.profiles p on p.id = m.user_id where m.user_id = pg_temp.u('1') and p.last_name = 'Eliminato'$$, 1);
select test.rows('nothing left holds the old name', $$select 1 from public.profiles where first_name = 'Pia' and last_name = 'One'$$, 0);
select test.rows('the board reads the record', $$select 1 from public.member_deletions$$, 1);
select test.logout();
select test.rows('the vote stays (read past the rules, votes are private)', $$select 1 from public.mvp_votes where voter_id = pg_temp.u('1')$$, 1);


\echo == afterwards
select test.login(pg_temp.u('1'));
select test.rows('the deleted person is no longer a member', $$select 1 from public.my_season(pg_temp.season())$$, 0);
select test.rows('and sees no events', $$select 1 from public.events$$, 0);
select test.logout();
select test.login(pg_temp.u('2'));
select test.rows('a player does not read the record', $$select 1 from public.member_deletions$$, 0);
select test.logout();
insert into auth.users (id, email, email_confirmed_at) values (pg_temp.u('b2'), 'board2@example.test', now());
insert into public.profiles (id, first_name, last_name) values (pg_temp.u('b2'), 'Bruno', 'Board');
insert into public.user_roles values (pg_temp.u('b2'), 'board');
select test.login(pg_temp.u('b1'));
select test.works('a board member can delete another board member', $$select public.delete_member_data(pg_temp.u('b2'))$$);
select test.rows('and a board member stays', $$select 1 from public.user_roles where role = 'board'$$, 1);
select test.logout();
select test.login(pg_temp.u('b2'));
select test.fails('a deleted board member can no longer delete anybody', $$select public.delete_member_data(pg_temp.u('2'))$$, 'forbidden');
select test.logout();
rollback;
\echo ALL MEMBER DELETION TESTS PASSED
