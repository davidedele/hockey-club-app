begin;

-- A fixed moment, ten in the morning Italian time, so the days to the end date are exact.
create temp table base as select date_trunc('day', now() at time zone 'Europe/Rome') + interval '10 hours' as local;
alter table base add column t timestamptz;
update base set t = local at time zone 'Europe/Rome';
grant select on base to service_role;
grant usage on schema test to service_role;

-- p1 to p6 play in group A, p7 belongs to no group, p8 switched the club emails off, p9 plays in group B only.
insert into auth.users (id, email, email_confirmed_at)
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'p' || n || '@example.test', now()
  from generate_series(1, 9) n;
insert into public.profiles (id, first_name, last_name)
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'Pia' || chr(64 + n), 'Rossi'
  from generate_series(1, 9) n;
insert into public.profile_contacts (user_id, email)
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'p' || n || '@example.test'
  from generate_series(1, 9) n;
insert into public.group_members (group_id, user_id)
  select (select id from public.groups where code = 'A'), ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
  from generate_series(1, 6) n;
insert into public.group_members (group_id, user_id) values
  ((select id from public.groups where code = 'A'), '00000000-0000-0000-0000-000000000008'),
  ((select id from public.groups where code = 'B'), '00000000-0000-0000-0000-000000000009');
insert into public.reminder_prefs (user_id, enabled) values ('00000000-0000-0000-0000-000000000008', false);

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.day(n integer) returns date language sql as $$ select ((select local from base))::date + n $$;

-- An ordinary requirement with an end date, for group A only, and one that is archived.
insert into public.requirements (title, reason, group_ids, expiry_block, expiry_months)
  values ('Tessera federale', 'Serve ogni anno.', array[(select id from public.groups where code = 'A')], 'd', 12);
insert into public.requirements (title, reason, expiry_block, expiry_months, active)
  values ('Vecchio modulo', 'Archiviato.', 'd', 12, false);
insert into public.requirement_versions (requirement_id, version, blocks)
  select id, 1, '[{"id":"d","type":"date","label":"Data","required":true}]'::jsonb from public.requirements where title in ('Tessera federale', 'Vecchio modulo');
-- The ids are kept aside because the server role cannot read the table itself.
create temp table ids as select
  (select id from public.requirements where slug = 'medical_certificate') as cert,
  (select id from public.requirements where title = 'Tessera federale') as tessera,
  (select id from public.requirements where title = 'Vecchio modulo') as old;
grant select on ids to service_role;
create function pg_temp.cert() returns uuid language sql as $$ select cert from ids $$;
create function pg_temp.tessera() returns uuid language sql as $$ select tessera from ids $$;
create function pg_temp.old() returns uuid language sql as $$ select old from ids $$;

create function pg_temp.answer(p_req uuid, p_user text, p_days integer, p_status text default 'complete') returns void language sql as $$
  insert into public.requirement_answers (requirement_id, user_id, version, answers, status, valid_until)
  values (p_req, pg_temp.u(p_user), 1, '{}', p_status, pg_temp.day(p_days))
  on conflict (requirement_id, user_id) do update set valid_until = excluded.valid_until, status = excluded.status
$$;

-- The certificate: p1 far away, p2 to p6 at each of the five moments, p7 plays nowhere, p8 said no emails.
-- p9 plays in group B, but the certificate is for everybody.
select pg_temp.answer(pg_temp.cert(), '1', 90);
select pg_temp.answer(pg_temp.cert(), '2', 45);
select pg_temp.answer(pg_temp.cert(), '3', 20);
select pg_temp.answer(pg_temp.cert(), '4', 5, 'approved');
select pg_temp.answer(pg_temp.cert(), '5', 0);
select pg_temp.answer(pg_temp.cert(), '6', -40);
select pg_temp.answer(pg_temp.cert(), '7', 5);
select pg_temp.answer(pg_temp.cert(), '8', 5);
select pg_temp.answer(pg_temp.cert(), '9', 5);

\echo == who is due, and at which moment
set local role service_role;
select test.rows('nine answers, six are at a moment and play', $$select 1 from public.requirements_due((select t from base))$$, 6);
select test.rows('three months away is not due', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('1')$$, 0);
select test.rows('forty five days away is the two month warning', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('2') and stage = 60$$, 1);
select test.rows('twenty days away is the one month warning', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('3') and stage = 30$$, 1);
select test.rows('five days away is the week warning, also for an approved answer', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('4') and stage = 7$$, 1);
select test.rows('the day itself is the last warning before it runs out', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('5') and stage = 0$$, 1);
select test.rows('forty days late is the one after', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('6') and stage = -30$$, 1);
select test.rows('somebody who plays in no group is left alone', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('7')$$, 0);
select test.rows('somebody who switched the club emails off is left alone', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('8')$$, 0);
select test.rows('a requirement for everybody reaches a player of any group', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('9')$$, 1);
select test.rows('the days left, the title and the address come with it', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('4') and days = 5 and title = 'Certificato medico' and slug = 'medical_certificate' and email = 'p4@example.test'$$, 1);
reset role;

\echo == a requirement for one group, an answer sent back and an archived requirement
select pg_temp.answer(pg_temp.tessera(), '4', 5);
select pg_temp.answer(pg_temp.tessera(), '9', 5);
select pg_temp.answer(pg_temp.old(), '4', 5);
select pg_temp.answer(pg_temp.cert(), '2', 45, 'rejected');
set local role service_role;
select test.rows('a requirement for group A reaches a player of group A', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('4') and title = 'Tessera federale'$$, 1);
select test.rows('and not a player of another group', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('9') and title = 'Tessera federale'$$, 0);
select test.rows('an archived requirement is left alone', $$select 1 from public.requirements_due((select t from base)) where title = 'Vecchio modulo'$$, 0);
select test.rows('an answer that was sent back is left alone', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('2')$$, 0);
reset role;
update public.requirements set current_version = 2 where id = pg_temp.tessera();
insert into public.requirement_versions (requirement_id, version, blocks)
  values (pg_temp.tessera(), 2, '[{"id":"d","type":"date","label":"Data","required":true}]'::jsonb);
set local role service_role;
select test.rows('an answer to an older version is left alone', $$select 1 from public.requirements_due((select t from base)) where title = 'Tessera federale'$$, 0);
reset role;

\echo == at night nothing goes out
set local role service_role;
select test.rows('nothing at eleven at night', $$select 1 from public.requirements_due((select t from base) + interval '13 hours')$$, 0);
select test.rows('nothing at six in the morning', $$select 1 from public.requirements_due((select t from base) - interval '4 hours')$$, 0);
reset role;

\echo == each moment is sent once, for each requirement
set local role service_role;
select test.works('the server writes down what it sent', $$select public.requirements_mark_sent(pg_temp.cert(), pg_temp.u('4'), pg_temp.day(5), 7::smallint)$$);
select test.rows('that person is no longer due for it', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('4') and slug = 'medical_certificate'$$, 0);
select test.works('writing it down twice is harmless', $$select public.requirements_mark_sent(pg_temp.cert(), pg_temp.u('4'), pg_temp.day(5), 7::smallint)$$);
select test.rows('the next moment comes anyway', $$select 1 from public.requirements_due((select t from base) + interval '5 days') where user_id = pg_temp.u('4') and slug = 'medical_certificate' and stage = 0$$, 1);
reset role;

\echo == a renewed answer starts again
select pg_temp.answer(pg_temp.cert(), '4', 300);
set local role service_role;
select test.rows('a long way off, nothing is due', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('4') and slug = 'medical_certificate'$$, 0);
reset role;
select pg_temp.answer(pg_temp.cert(), '4', 45);
set local role service_role;
select test.rows('the new date gets its own warnings', $$select 1 from public.requirements_due((select t from base)) where user_id = pg_temp.u('4') and slug = 'medical_certificate' and stage = 60$$, 1);
reset role;

\echo == nobody else can ask or read
select test.login(pg_temp.u('1'));
select test.fails('a player cannot ask who is due', $$select 1 from public.requirements_due((select t from base))$$, 'permission denied');
select test.fails('a player cannot read the log', $$select 1 from public.requirement_reminder_log$$, 'permission denied');
select test.fails('a player cannot write the log', $$select public.requirements_mark_sent(pg_temp.cert(), pg_temp.u('1'), pg_temp.day(5), 7::smallint)$$, 'permission denied');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot ask who is due', $$select 1 from public.requirements_due((select t from base))$$, 'permission denied');
select test.logout();

\echo == what is left when a member goes
select test.rows('the log has the one that was sent', $$select 1 from public.requirement_reminder_log where user_id = pg_temp.u('4')$$, 1);
delete from public.profiles where id = pg_temp.u('4');
select test.rows('a member who leaves takes their log with them', $$select 1 from public.requirement_reminder_log where user_id = pg_temp.u('4')$$, 0);
