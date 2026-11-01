# Setting up the Supabase test project

Use the test project only. Never the club's live data.

1. Create a free Supabase project for testing.
2. In the SQL editor, run `supabase/migrations/0001_members_groups_invites.sql`, then `supabase/migrations/0002_events_attendance.sql`.
3. In Authentication settings, keep "Confirm email" on, and add the site address (for example `http://localhost:5173`) to the allowed redirect URLs.
4. In Authentication > Users, add the first user, then run `supabase/bootstrap_first_board.sql` after filling in the three values. That person becomes the first board member.
5. Copy `.env.example` to `.env` and fill in the project URL and the anon key.
6. Run `npm install`, then `npm run dev`.

Checks that run without Supabase:
1. `npm run test:db` runs the migrations and the access rule tests on a throwaway local Postgres. On a Mac, install Postgres with Homebrew (for example `brew install postgresql@16`), or set `PG_BIN` to the folder with the Postgres programs.
2. `npm test` runs the text file tests, and `npm run typecheck` checks the code.

Email setup (custom sender and email confirmation) is in `docs/SETUP_EMAIL.md`.

## Interface checker on the iPhone engine and other settings

`node scripts/ui-check.mjs` opens every page at 320, 375, 390, 430, 768 and 1280 pixels. Settings are environment variables:

1. `UI_CHECK_WEBKIT=1 node scripts/ui-check.mjs` runs it on WebKit, the engine of iPhone Safari. WebKit could not run in the cloud container used for the build, so run it once on the Mac: `npx playwright install webkit`, then the command above. Screenshots go to `ui-check/<width>-webkit`.
2. `UI_CHECK_DARK=1` runs the dark colour scheme, `UI_CHECK_LARGE=1` a larger text size. They can be combined with the first one. Screenshots go to `ui-check/<width>-dark`, `-large` and so on.
3. `UI_CHECK_WIDTHS=375,1280` limits the widths for a quick run.

## Applying the new migrations to the test project (0036 to 0051)

1. Apply the files of `supabase/apply` in number order in the SQL Editor of the TEST project: `apply_0036_certificate_issue_date.sql`, `apply_0037_rink_address.sql`, `apply_0038_my_season.sql`, `apply_0039_push_notifications.sql`, `apply_0040_delete_member_data.sql`, `apply_0041_board_two_step.sql`, `apply_0042_keep_history_on_account_delete.sql`, `apply_0043_opponent_history.sql`, `apply_0044_club_documents.sql`, `apply_0045_match_video.sql`, `apply_0046_pinned_announcements.sql`, `apply_0047_my_milestones.sql`, `apply_0048_game_predictions.sql`, `apply_0049_season_leaders.sql`, `apply_0050_no_direct_profile_delete.sql`, `apply_0051_scrub_deleted_account.sql`. Each stops by itself on the wrong project or on a second run. `bash scripts/test-apply.sh` checks the files on a local Postgres. Regenerate them with `node scripts/make-apply.mjs` after any change to a migration.
2. Deploy the new server function `delete-member` (Verify JWT on; deploy it again if you deployed an earlier version: it now disables the sign in account instead of deleting it and, after migration 0051, empties the sign up data left in the account) and deploy `send-reminders` again (it now sends push). See `docs/SETUP_PUSH.md`.
3. `QA_WRITE=1 node scripts/qa-real.mjs` reads the test project as the test player and the test board account, and compares the numbers on screen with the database. Without QA_WRITE it writes nothing.

## Trying the member deletion on the test project (decision 96, migration 0042)

The deletion erases the personal data and disables the sign in account. It must not delete the account, because that would erase the whole history of the person.

1. Make one throwaway member named "Prova QA 4" (an invite link, a sign up with a spare email address, join a team). Give the person some history: answer one event, and ask a coach to record their attendance or a game statistic.
2. Signed in as a board member, open the member page of "Prova QA 4" and use "Elimina i dati". Confirm in the window that names the person.
3. In the Supabase dashboard, Authentication, Users, find the account by its old email: it is gone from the list. Search for `deleted.invalid`: there is one user whose email is `deleted-<long id>@deleted.invalid`. Open it: the user is banned (banned until a date about a hundred years away), the raw user metadata is empty (`{}`), and the user has no factors.
4. In the SQL Editor run (replace the id with the id shown in the dashboard):

```sql
select id, first_name, last_name, deleted_at from public.profiles where last_name = 'Eliminato';
select count(*) from public.attendance_answers where user_id = '<id>';
select count(*) from public.attendance_records where user_id = '<id>';
select count(*) from public.game_stats where user_id = '<id>';
select count(*) from public.event_messages where user_id = '<id>';
```

The profile reads "Utente Eliminato", and the counts are the ones the person had before (not zero). The Statistiche and Presenze pages show the same totals as before, under the name "Utente Eliminato".
5. Try to sign in with the old email and password: refused. Try the "Password dimenticata" link with the old email: no mail arrives.
6. As a last check run `delete from auth.users where id = '<id>';` in a transaction you roll back (`begin; delete ...; rollback;`): it must fail with `profiles_id_fkey`.

## Checking that no personal data is left in the sign in account (decision 122, migrations 0050 and 0051)

Do this after `apply_0050` and `apply_0051` are run and `delete-member` is deployed again. The local tests cannot run Supabase's own API, so this is the only proof that the real account is clean. Use a new throwaway member, not one deleted with the old function.

1. Make a throwaway member "Prova QA 5" (invite link, sign up with a spare email address, first and last name typed in the form, join a team). Give the person some history: answer one event, and ask a coach to record attendance or a game statistic.
2. In the SQL Editor, before the deletion, write down the id and the history counts (replace `<email>` with the spare address):

```sql
select id from auth.users where email = '<email>';
select (select count(*) from public.attendance_answers where user_id = '<id>') as answers,
       (select count(*) from public.attendance_records where user_id = '<id>') as records,
       (select count(*) from public.game_stats where user_id = '<id>') as stats,
       (select count(*) from public.event_messages where user_id = '<id>') as messages,
       (select count(*) from public.mvp_votes where voted_id = '<id>' or voter_id = '<id>') as votes,
       (select count(*) from public.game_ratings where rated_id = '<id>' or rater_id = '<id>') as ratings;
```

3. Signed in as a board member, open the member page and use "Elimina i dati". Confirm in the window.
4. Run these checks (replace `<id>`). Each one must give the answer written under it:

```sql
select raw_user_meta_data, email, banned_until from auth.users where id = '<id>';
```
`raw_user_meta_data` is `{}` (technical fields only, such as `sub`, would also be fine; no name and no original email). `email` is `deleted-<id>@deleted.invalid`. `banned_until` is a date about a hundred years away.

```sql
select identity_data, email from auth.identities where user_id = '<id>';
```
`identity_data` holds exactly `sub`, `email` (`deleted-<id>@deleted.invalid`) and `email_verified`. No `first_name`, no `last_name`, no `phone_verified`, no original email. The `email` column is the deleted one.

```sql
select count(*) from auth.users u left join auth.identities i on i.user_id = u.id
 where u.id = '<id>' and (u.raw_user_meta_data::text || coalesce(i.identity_data::text, '')) ~* '(<first name>|<last name>|<email>)';
```
Must be 0 (replace the three words with what was typed at sign up).

```sql
select id, first_name, last_name, deleted_at from public.profiles where id = '<id>';
```
The profile reads "Utente Eliminato" and `deleted_at` is set. Run the counts of step 2 again: they are the same as before the deletion.

5. Check that other people were not touched: `select count(*) from auth.users where raw_user_meta_data = '{}'::jsonb and email not like 'deleted-%';` is the number of accounts that never had sign up data (your own invited accounts that were created in the dashboard), and every real member still shows their names in `raw_user_meta_data`.
6. Check that a direct delete of a profile is refused. No screen deletes a profile, so check the rights: `select has_table_privilege('authenticated', 'public.profiles', 'DELETE');` must give `false`, and `select count(*) from pg_policies where tablename = 'profiles' and cmd = 'DELETE';` must give `0`.
7. Second try after a half finished deletion: deleting again from the member page says the person is already deleted; the function carries on with the cleaning for the board. Nothing else to check.
8. If the deletion fails with "account" and the function log says `permission denied for table identities` or `users`, tell Claude: the function owner needs rights on the auth schema in that project.
