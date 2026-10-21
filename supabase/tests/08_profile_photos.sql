begin;

-- People: board1 (board), p1 and p2 (players), stranger (account without a profile).
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.test', now()),
  ('00000000-0000-0000-0000-0000000000d1', 'stranger@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One'),
  ('00000000-0000-0000-0000-000000000002', 'Pio', 'Two');
insert into public.user_roles values ('00000000-0000-0000-0000-0000000000b1', 'board');
-- p2 already has a picture.
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-000000000002/avatar-1000000000.jpg');

\echo == profile pictures
select test.login('00000000-0000-0000-0000-000000000001');
select test.works('a player uploads a picture into their own folder', $$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-000000000001/avatar-2000000000.jpg')$$);
select test.fails('a player cannot upload into someone else''s folder', $$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-000000000002/avatar-2000000000.jpg')$$, 'row-level security');
select test.affected('a player sets their own picture', $$update public.profiles set avatar_path = '00000000-0000-0000-0000-000000000001/avatar-2000000000.jpg' where id = auth.uid()$$, 1);
select test.fails('the picture must sit in the person''s own folder', $$update public.profiles set avatar_path = '00000000-0000-0000-0000-000000000002/avatar-1000000000.jpg' where id = auth.uid()$$, 'violates check constraint');
select test.affected('a player cannot set the picture of someone else', $$update public.profiles set avatar_path = null where id = '00000000-0000-0000-0000-000000000002'$$, 0);
select test.rows('a member sees other members'' pictures', $$select * from storage.objects where bucket_id = 'avatars'$$, 2);
select test.affected('a player cannot remove someone else''s picture', $$delete from storage.objects where name like '00000000-0000-0000-0000-000000000002/%'$$, 0);
select test.affected('a player removes their own picture', $$delete from storage.objects where name like '00000000-0000-0000-0000-000000000001/%'$$, 1);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000d1');
select test.rows('an account without a profile sees no pictures', $$select * from storage.objects where bucket_id = 'avatars'$$, 0);
select test.fails('an account without a profile cannot upload', $$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-0000000000d1/avatar-2000000000.jpg')$$, 'row-level security');
select test.logout();
select test.login_anon();
select test.rows('anonymous sees no pictures', $$select * from storage.objects where bucket_id = 'avatars'$$, 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.affected('the board can remove any picture', $$delete from storage.objects where name like '00000000-0000-0000-0000-000000000002/%'$$, 1);
select test.logout();

rollback;
\echo ALL PROFILE PICTURE TESTS PASSED
