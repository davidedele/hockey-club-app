# Progress log

Update this file at the end of every session, so the next session starts exactly where this one stopped.
Keep entries short and put the newest first.

## Current state
Build step 1 (login, invite links, groups, members) works against the Supabase test project. Davide tried it in a browser: log in as the first board member, create an invite, join with it as a new player. The player sees no Invites tab and no emails or phones, as intended.

## Session log
1. 21 October 2026, second session (cloud):
   1. Database migration for groups, members, contacts, roles and invites, with row level security. 70 access rule tests on a local Postgres (`npm run test:db`), all passing.
   2. App skeleton in React and TypeScript with the Italian text file: login, join by invite, password reset, members list, own profile, invite creation and revoking for staff.
   3. Test project created by Davide, migration applied, first board account created with `supabase/bootstrap_first_board.sql`, `.env` filled in. Steps are in `docs/SETUP_TEST_PROJECT.md`.
   4. Sign up errors now show the real reason in Italian.
   5. A signed in member who opens an invite link now has to press a button before the invite is used. Reason: Davide opened his own link while logged in and the old code used it up for his own account (confirmed in the invites table).
2. 21 October 2026, first session: specification, notes on the current app, decisions and working rules written. Repository created.

## Next
1. Turn email confirmation back on in the test project and connect a proper email sender (custom SMTP) before real players use it. See the open problems.
2. Finish the step 1 screens that are missing: board editing of roles and group membership, removing a member. The database already allows them.
3. Check the new "use this invite" button in the browser (not yet tried).
4. Add the install icons for the PWA.
5. Then step 2: events with weekly repeat, and attendance with reminders.

## Open problems
1. In the Supabase test project, "Confirm email" is switched OFF for testing, because the built in email service allows only a few emails per hour. It must be switched on again and a custom email sender connected before real use. The confirmation email path has therefore not been tested yet.
2. The app is not yet installable as a real PWA: there is a manifest but no icons and no service worker. The service worker comes with push notifications (step 9).
3. Invite details (single use, 7 days) may be revisited. Davide prefers to refine them later.
4. A deleted member keeps their sign in account. Only the profile is removed, which blocks all access. Full account removal needs a server side step.
5. The contact email is copied from the account at joining and does not follow later changes.
6. A person who creates an account some other way than a link has no profile and sees nothing. Names are taken from the join form only. An account created by hand in the Supabase dashboard cannot join with an invite, because it has no names.
7. Still open in `SPEC.md`: how weekly plans are set and edited (to add later), and the app name.
8. `npm run test:db` looks for Postgres in the Linux location. On a Mac it needs a small change and Postgres installed.
9. Working setup: the build has run in cloud sessions, where the Supabase plugin could not connect (network policy). Davide may continue in a local session, where his installed plugins work. Read `CLAUDE.md`, `docs/SPEC.md`, `docs/DECISIONS.md` and this file first.
