begin;

-- A fixed moment, ten in the morning Italian time, so the days to the expiry date are exact.
create temp table base as select date_trunc('day', now() at time zone 'Europe/Rome') + interval '10 hours' as local;
alter table base add column t timestamptz;
update base set t = local at time zone 'Europe/Rome';
grant select on base to service_role;
grant usage on schema test to service_role;

-- p1 to p6 play, p7 belongs to no group, p8 switched the club emails off.
insert into auth.users (id, email, email_confirmed_at)
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'p' || n || '@example.test', now()
  from generate_series(1, 8) n;
insert into public.profiles (id, first_name, last_name)
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'Pia' || n, 'Rossi'
  from generate_series(1, 8) n;
insert into public.profile_contacts (user_id, email)
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'p' || n || '@example.test'
  from generate_series(1, 8) n;
insert into public.group_members (group_id, user_id)
  select (select id from public.groups where code = 'A'),
         ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
  from generate_series(1, 6) n;
insert into public.group_members (group_id, user_id)
  select (select id from public.groups where code = 'A'), ('00000000-0000-0000-0000-000000000008')::uuid;
insert into public.reminder_prefs (user_id, enabled) values ('00000000-0000-0000-0000-000000000008', false);

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.day(n integer) returns date language sql as $$ select ((select local from base))::date + n $$;
create function pg_temp.cert(p_user text, p_days integer) returns void language plpgsql as $$
begin
  insert into public.member_documents (user_id, kind, valid_until)
    values (pg_temp.u(p_user), 'medical_certificate', pg_temp.day(p_days))
    on conflict (user_id, kind) do update set valid_until = excluded.valid_until;
end $$;

-- p1 is far away, p2 to p6 are at each of the five moments, p7 plays nowhere, p8 said no emails.
select pg_temp.cert('1', 90);
select pg_temp.cert('2', 45);
select pg_temp.cert('3', 20);
select pg_temp.cert('4', 5);
select pg_temp.cert('5', 0);
select pg_temp.cert('6', -40);
select pg_temp.cert('7', 5);
select pg_temp.cert('8', 5);

\echo == who is due, and at which moment
set local role service_role;
select test.rows('six people have a certificate, five are due', $$select 1 from public.certificates_due((select t from base))$$, 5);
select test.rows('a certificate three months away is not due', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('1')$$, 0);
select test.rows('forty five days away is the two month warning', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('2') and stage = 60$$, 1);
select test.rows('twenty days away is the one month warning', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('3') and stage = 30$$, 1);
select test.rows('five days away is the week warning', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('4') and stage = 7$$, 1);
select test.rows('the day itself is the last warning before it runs out', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('5') and stage = 0$$, 1);
select test.rows('forty days late is the one after', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('6') and stage = -30$$, 1);
select test.rows('somebody who plays in no group is left alone', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('7')$$, 0);
select test.rows('somebody who switched the club emails off is left alone', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('8')$$, 0);
select test.rows('the days left come with it', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('4') and days = 5$$, 1);
select test.rows('the address comes with it', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('4') and email = 'p4@example.test'$$, 1);
reset role;

\echo == at night nothing goes out
set local role service_role;
select test.rows('nothing at eleven at night', $$select 1 from public.certificates_due((select t from base) + interval '13 hours')$$, 0);
select test.rows('nothing at six in the morning', $$select 1 from public.certificates_due((select t from base) - interval '4 hours')$$, 0);
reset role;

\echo == each moment is sent once
set local role service_role;
select test.works('the server writes down what it sent', $$select public.certificates_mark_sent(pg_temp.u('4'), pg_temp.day(5), 7::smallint)$$);
select test.rows('that person is no longer due', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('4')$$, 0);
select test.rows('the others still are', $$select 1 from public.certificates_due((select t from base))$$, 4);
select test.works('writing it down twice is harmless', $$select public.certificates_mark_sent(pg_temp.u('4'), pg_temp.day(5), 7::smallint)$$);
select test.rows('the next moment comes anyway', $$select 1 from public.certificates_due((select t from base) + interval '5 days') where user_id = pg_temp.u('4') and stage = 0$$, 1);
reset role;

\echo == a renewed certificate starts again
select pg_temp.cert('4', 300);
set local role service_role;
select test.rows('a long way off, nothing is due', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('4')$$, 0);
reset role;
select pg_temp.cert('4', 45);
set local role service_role;
select test.rows('the new date gets its own warnings', $$select 1 from public.certificates_due((select t from base)) where user_id = pg_temp.u('4') and stage = 60$$, 1);
reset role;

\echo == nobody else can ask or read
select test.login(pg_temp.u('1'));
select test.fails('a player cannot ask who is due', $$select 1 from public.certificates_due((select t from base))$$, 'permission denied');
select test.fails('a player cannot read the log', $$select 1 from public.certificate_log$$, 'permission denied');
select test.fails('a player cannot write the log', $$select public.certificates_mark_sent(pg_temp.u('1'), pg_temp.day(5), 7::smallint)$$, 'permission denied');
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot ask who is due', $$select 1 from public.certificates_due((select t from base))$$, 'permission denied');
select test.logout();

-- Read as the owner of the database: the log is not readable by any of the app's roles.
\echo == what is left when a member goes
select test.rows('the log has the one that was sent', $$select 1 from public.certificate_log where user_id = pg_temp.u('4')$$, 1);
delete from public.profiles where id = pg_temp.u('4');
select test.rows('a member who leaves takes their log with them', $$select 1 from public.certificate_log where user_id = pg_temp.u('4')$$, 0);
