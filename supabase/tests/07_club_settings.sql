begin;

-- People: board1 (board), coach1 (coach), p1 (player in A).
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'board1@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'coach1@example.test', now()),
  ('00000000-0000-0000-0000-000000000001', 'p1@example.test', now());
insert into public.profiles (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Bea', 'Board'),
  ('00000000-0000-0000-0000-0000000000c1', 'Cora', 'Coach'),
  ('00000000-0000-0000-0000-000000000001', 'Pia', 'One');
insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000b1', 'board'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach');
insert into public.group_members (group_id, user_id)
  select id, '00000000-0000-0000-0000-000000000001' from public.groups where code = 'A';
-- A file in another bucket, to check staff rights stop at the club bucket.
insert into storage.buckets (id, name) values ('other', 'other');
insert into storage.objects (bucket_id, name) values ('other', 'x.png'), ('club', 'logo-1000000000.png');

\echo == club settings
select test.login_anon();
select test.fails('anonymous cannot read the club settings', $$select * from public.club_settings$$, 'permission denied');
select test.fails('anonymous cannot change it', $$update public.club_settings set name = 'X'$$, 'permission denied');
select test.logout();
select test.login('00000000-0000-0000-0000-000000000001');
select test.rows('a member reads the club name', $$select * from public.club_settings where name = 'Hockey Club'$$, 1);
select test.affected('a player cannot change the club name', $$update public.club_settings set name = 'X'$$, 0);
select test.fails('nobody can add a second settings row', $$insert into public.club_settings (id) values (true)$$, 'permission denied');
select test.fails('nobody can delete the settings', $$delete from public.club_settings$$, 'permission denied');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.affected('a coach cannot change the club name', $$update public.club_settings set name = 'X'$$, 0);
select test.affected('a coach cannot change the colours', $$update public.club_settings set game_dark = '#000000'$$, 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.affected('the board changes the club name', $$update public.club_settings set name = 'Sgularat Milano'$$, 1);
select test.affected('the board sets the colours', $$update public.club_settings set game_dark = '#000000', game_light = '#ffcc00'$$, 1);
select test.fails('a colour must be a hex code', $$update public.club_settings set game_dark = 'black'$$, 'violates check constraint');
select test.fails('a logo path must be a logo file name', $$update public.club_settings set logo_path = '../x.png'$$, 'violates check constraint');
select test.affected('the board sets the logo file', $$update public.club_settings set logo_path = 'logo-1000000000.png'$$, 1);
select test.logout();

\echo == logo files
select test.login('00000000-0000-0000-0000-000000000001');
select test.fails('a player cannot upload a logo', $$insert into storage.objects (bucket_id, name) values ('club', 'logo-2000000000.png')$$, 'row-level security');
select test.affected('a player cannot remove the logo', $$delete from storage.objects where bucket_id = 'club'$$, 0);
select test.logout();
select test.login_anon();
select test.fails('anonymous cannot upload a logo', $$insert into storage.objects (bucket_id, name) values ('club', 'logo-2000000000.png')$$, 'row-level security');
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.fails('a coach cannot upload a logo', $$insert into storage.objects (bucket_id, name) values ('club', 'logo-2000000000.png')$$, 'row-level security');
select test.affected('a coach cannot remove the logo', $$delete from storage.objects where name = 'logo-1000000000.png'$$, 0);
select test.logout();
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.works('the board uploads a logo', $$insert into storage.objects (bucket_id, name) values ('club', 'logo-2000000000.png')$$);
select test.fails('rights stop at the club bucket', $$insert into storage.objects (bucket_id, name) values ('other', 'y.png')$$, 'row-level security');
select test.affected('the board cannot remove files of other buckets', $$delete from storage.objects where bucket_id = 'other'$$, 0);
select test.affected('the board removes an old logo', $$delete from storage.objects where name = 'logo-1000000000.png'$$, 1);
select test.logout();

rollback;
\echo ALL CLUB SETTINGS TESTS PASSED
