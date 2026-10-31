begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-000000000001', 'Nomea', 'Cognomea'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach');
insert into public.profile_contacts (user_id, email) values ('00000000-0000-0000-0000-000000000001', 'p1@example.test');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id) select g.id, '00000000-0000-0000-0000-000000000001'::uuid from public.groups g where g.code = 'A';

create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid $$;

\echo == event length
select test.login(pg_temp.u('c1'));
select test.rows('an event of exactly 12 hours is created', $$select 1 from (select public.create_event('training', 'twelve', now() + interval '2 days', now() + interval '2 days 12 hours', null, 'Rink', array(select id from public.groups where code = 'A')::smallint[])) x$$, 1);
select test.fails('an event of 12 hours and a minute is refused', $$select public.create_event('training', 'too long', now() + interval '3 days', now() + interval '3 days 12 hours 1 minute', null, 'Rink', array(select id from public.groups where code = 'A')::smallint[])$$, 'events_duration_max');
select test.fails('an event of 20 hours is refused', $$select public.create_event('training', 'twenty', now() + interval '4 days', now() + interval '4 days 20 hours', null, 'Rink', array(select id from public.groups where code = 'A')::smallint[])$$, 'events_duration_max');
select test.affected('an event is made shorter', $$update public.events set ends_at = starts_at + interval '90 minutes' where title = 'twelve'$$, 1);
select test.fails('an event cannot be stretched past 12 hours afterwards', $$update public.events set ends_at = starts_at + interval '13 hours' where title = 'twelve'$$, 'events_duration_max');
select test.logout();

\echo == phone numbers
select test.login(pg_temp.u('1'));
select test.affected('an Italian mobile number is accepted', $$update public.profile_contacts set phone = '333 123 4567' where user_id = pg_temp.u('1')$$, 1);
select test.affected('with the country code', $$update public.profile_contacts set phone = '+39 333 123 4567' where user_id = pg_temp.u('1')$$, 1);
select test.affected('a landline with a slash', $$update public.profile_contacts set phone = '02/1234567' where user_id = pg_temp.u('1')$$, 1);
select test.affected('a number written with 0039', $$update public.profile_contacts set phone = '0039 333 1234567' where user_id = pg_temp.u('1')$$, 1);
select test.affected('an empty number stays allowed', $$update public.profile_contacts set phone = '' where user_id = pg_temp.u('1')$$, 1);
select test.affected('no number stays allowed', $$update public.profile_contacts set phone = null where user_id = pg_temp.u('1')$$, 1);
select test.fails('letters are refused', $$update public.profile_contacts set phone = 'abc' where user_id = pg_temp.u('1')$$, 'profile_contacts_phone_format');
select test.fails('digits mixed with letters are refused', $$update public.profile_contacts set phone = '333 12x 4567' where user_id = pg_temp.u('1')$$, 'profile_contacts_phone_format');
select test.fails('too few digits are refused', $$update public.profile_contacts set phone = '12345' where user_id = pg_temp.u('1')$$, 'profile_contacts_phone_format');
select test.fails('too many digits are refused', $$update public.profile_contacts set phone = '123456789012345678' where user_id = pg_temp.u('1')$$, 'profile_contacts_phone_format');
select test.fails('markup is refused', $$update public.profile_contacts set phone = '<b>3331234567</b>' where user_id = pg_temp.u('1')$$, 'profile_contacts_phone_format');
select test.fails('a plus in the middle is refused', $$update public.profile_contacts set phone = '333+1234567' where user_id = pg_temp.u('1')$$, 'profile_contacts_phone_format');
select test.logout();

rollback;
