# Setup: the production database

A checklist for Davide. Nothing here has been created by Claude. The test project stays a test project: no test build, test account or test data ever connects to the production project (decision 102).

## 1. The project

1. Create a second Supabase project for the club, with the club's own account as owner, and add a second owner for safety.
2. Choose an EU region (for example Frankfurt or Ireland). The region cannot be changed later.
3. Choose the Pro plan (from 25 dollars a month, checked on 1 November 2026: check the live pricing page before paying). A free project is paused after about 7 days of low activity and has no automatic backups; Pro is not paused and keeps 7 days of daily backups. Point in time recovery is a paid extra and is optional for a club this size.
4. Write the project address and the project reference in your password manager. The service role key and the database password go there too, and nowhere else.

## 2. The database

1. Open the SQL Editor of the new project and apply the files of `supabase/apply` in number order, one at a time: from `apply_0036` onward the files exist; for the migrations 0001 to 0035 use the files you used on the test project (or paste the migrations from `supabase/migrations` in order). Each file stops by itself if it is run twice or on a project that does not have the earlier ones.
2. Do not run any test data script on this project. `supabase/tests` never runs there.
3. Create the first board account: sign up in the app, then run `supabase/bootstrap_first_board.sql` as described in `docs/SETUP_TEST_PROJECT.md`, with the production email address.

## 3. The server functions and secrets

1. Deploy the functions as on the test project: `league-sync`, `league-match`, `calendar-feed`, `send-reminders` (Verify JWT off for the first, third and fourth as in their setup notes) and `delete-member` (Verify JWT on). See `docs/SETUP_REMINDERS.md`, `docs/SETUP_CALENDAR_FEED.md`, `docs/SETUP_PUSH.md`.
2. Set the secrets in the project's Edge Functions settings, never in the repository: `REMINDER_SECRET`, `RESEND_API_KEY`, `REMINDER_FROM`, `APP_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Make new values for production, different from the test ones.
3. Create the hourly job as in `docs/SETUP_REMINDERS.md`, with the production address and secret.
4. The league site (`legahockeylibertas.it`) must be reachable by the functions.

## 4. Sign in and email

1. Authentication, Sign In: switch "Confirm email" on (it is off on the test project) and switch on leaked password protection (Authentication, password security; it needs the Pro plan).
2. Connect the custom email sender (SMTP of Resend with the club's verified domain) as in `docs/SETUP_EMAIL.md`, so sign up and password emails do not use the small limit of the built in sender.
3. Set the Site URL to the real site address and add the real site address to the redirect addresses. Remove any localhost or test address from the redirect list.
4. Turn on TOTP (authenticator app) under multi factor settings, see `docs/SETUP_2FA.md`.

## 5. The site

1. Build the real site with the production project address and publishable (anon) key, and the public push key `VITE_VAPID_PUBLIC_KEY`. The test site keeps the test project. Use two separate sites or two separate build settings so a test build can never carry the production address (`docs/DEPLOY.md`).
2. EU handling (decision 50): confirm in the Netlify and Resend accounts where data is processed, and accept the data processing agreements of Supabase, Netlify and Resend. The privacy notice names them (`docs/PRIVACY_NOTICE_DRAFT.md`).

## 6. Backups

1. The daily backups of the plan are the first layer.
2. Every month make a dump with the Supabase command line tool and keep it outside Supabase (for example an encrypted disk of the club). The dump holds personal data: protect it like the database.
3. Try one restore into a scratch project (a third, temporary project) before members join, and delete the scratch project afterwards. Write down how long it took and what you did.

## 7. Before members join

1. The privacy notice is final and approved by the board (`docs/PRIVACY_NOTICE_DRAFT.md`), and uploaded under Impostazioni, Club, Documenti.
2. There are two board accounts, both with the two step sign in on.
3. Read `docs/SECURITY_REVIEW.md` and run the catalogue checks again on the production project (every table has row level security, every function has a fixed search path, nothing is open to signed out users beyond the harmless helper).
4. Invite one trusted player first and try: join, answer an event, notifications on a real phone, deleting that test member's data at the end.
5. Only then send the team links to the club.
