begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now());

\echo == capitals
select test.rows('a name in lower case gets initial capitals',
  $$select 1 where public.tidy_name('pansini mattia') = 'Pansini Mattia'$$, 1);
select test.rows('a name in upper case too, apostrophes and spaces included',
  $$select 1 where public.tidy_name('  DE   LUCA ') = 'De Luca' and public.tidy_name('d''angelo') = 'D''Angelo'$$, 1);
select test.rows('a name with its own capitals keeps them',
  $$select 1 where public.tidy_name('McKenzie') = 'McKenzie' and public.tidy_name('van DerBerg') = 'Van DerBerg'$$, 1);

\echo == saving
insert into public.profiles (id, first_name, last_name) values ('00000000-0000-0000-0000-000000000001', 'mattia', 'pansini');
select test.rows('a new profile is stored with capitals', $$select 1 from public.profiles where first_name = 'Mattia' and last_name = 'Pansini'$$, 1);
select test.login('00000000-0000-0000-0000-000000000001');
select test.works('a member renames themselves in lower case', $$update public.profiles set first_name = 'giulia maria' where id = '00000000-0000-0000-0000-000000000001'$$);
select test.logout();
select test.rows('the new name has capitals', $$select 1 from public.profiles where first_name = 'Giulia Maria'$$, 1);

\echo == digits
select test.fails('a new profile with a digit in the name is refused',
  $$insert into public.profiles (id, first_name, last_name) values ('00000000-0000-0000-0000-000000000002', '3', 'Prova')$$, 'profiles_names_no_digits');
select test.login('00000000-0000-0000-0000-000000000001');
select test.fails('a member cannot put a digit in the name', $$update public.profiles set last_name = 'Rossi2' where id = '00000000-0000-0000-0000-000000000001'$$, 'profiles_names_no_digits');
select test.logout();

\echo == helpers stay private
select test.login('00000000-0000-0000-0000-000000000001');
select test.fails('a member cannot call the helper directly', $$select public.tidy_name('x')$$, 'permission denied');
select test.logout();

rollback;
