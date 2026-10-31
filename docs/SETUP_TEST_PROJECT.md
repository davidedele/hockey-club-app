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
