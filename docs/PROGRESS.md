# Progress log

Update this file at the end of every session, so the next session starts exactly where this one stopped.
Keep entries short and put the newest first.

## Current state
Build step 1 works against the Supabase test project. Step 2 (events with weekly repeat, attendance answers, banner, staff attendance view) is written and tested locally, but its database migration has not been applied to the test project yet. Until it is, the new Events tab will show errors in the real app.

## Session log
1. 21 October 2026, third session (local, Davide away):
   1. Staff screen to edit a member: group membership (coaches and board), roles and removing a member (board only), with a named confirmation.
   2. Invite page no longer flashes the working text while the session loads. The "use this invite" button logic was reviewed and the database side is covered by tests. It still needs one real click in the browser.
   3. PWA install icons added and linked in the manifest and the page head.
   4. `docs/SETUP_EMAIL.md` written. The email sender itself still needs Davide.
   5. Step 2 database migration `0002_events_attendance.sql` with 71 new access rule tests (141 in total, all passing), including a check that weekly repeats keep the clock time across the autumn time change and a check that breaking two rules makes the tests fail.
   6. Step 2 screens: events list, new and edit event form, event page with Present and Absent answers, banner for unanswered events, staff list of who has not answered, recording who actually came, final score for games, deleting one event or this and the following.
   7. Looked at all screens at 375 and 1280 pixels wide with a fake backend: no sideways scrolling, tap targets at least 44 pixels, polish fixes applied. Not tried against the real Supabase project.
   8. `npm run test:db` now also finds Homebrew Postgres, or uses `PG_BIN`. The tests were run on a Linux copy because the shell used this session could not install Postgres in the usual way.
2. 21 October 2026, second session (cloud):
   1. Database migration for groups, members, contacts, roles and invites, with row level security. 70 access rule tests on a local Postgres (`npm run test:db`), all passing.
   2. App skeleton in React and TypeScript with the Italian text file: login, join by invite, password reset, members list, own profile, invite creation and revoking for staff.
   3. Test project created by Davide, migration applied, first board account created with `supabase/bootstrap_first_board.sql`, `.env` filled in. Steps are in `docs/SETUP_TEST_PROJECT.md`.
   4. Sign up errors now show the real reason in Italian.
   5. A signed in member who opens an invite link now has to press a button before the invite is used. Reason: Davide opened his own link while logged in and the old code used it up for his own account (confirmed in the invites table).
3. 21 October 2026, first session: specification, notes on the current app, decisions and working rules written. Repository created.

## Next
1. Done by Davide: the step 2 migration is applied in the test project and was tried (events, answers exist). Security advisors checked: row level security is on for every table. The warnings about functions that signed in users can call are intended, since each function checks the caller itself. One setting to switch on in the dashboard: leaked password protection (Authentication, password security), if the plan allows it.
2. Davide: create a Resend account and verify `mail.onlyai.lol`, following `docs/SETUP_EMAIL.md`, then send me the SMTP details to enter in Supabase (the key stays private, never in the repository). Then switch "Confirm email" on.
3. Davide: click the "use this invite" button once as a signed in member (open an invite link while logged in).
4. Reminders, as decided on 21 October (see `DECISIONS.md`): push first, one reminder the day before a training, more frequent when time is short, managed by the board and managers, and a daily list of who has not answered for coaches. Push needs the service worker and push subscriptions (build step 9), so build that part together with the reminder rules. A first useful piece that needs no push: the coach list of who has not answered, shown in the app.
5. Attendance season summary per player and the per event grid (spec section 5), for coaches and the board.
6. Edit groups of an existing event, and change a whole series at once.
7. Step 3: weekly limit and warnings.

## Open problems
1. In the Supabase test project, "Confirm email" is switched OFF for testing, because the built in email service allows only a few emails per hour. It must be switched on again and a custom email sender connected before real use. The confirmation email path has therefore not been tested yet.
2. The app is not yet installable as a real PWA: there is a manifest but no icons and no service worker. The service worker comes with push notifications (step 9).
3. Invite details (single use, 7 days) may be revisited. Davide prefers to refine them later.
4. A deleted member keeps their sign in account. Only the profile is removed, which blocks all access. Full account removal needs a server side step.
5. The contact email is copied from the account at joining and does not follow later changes.
6. A person who creates an account some other way than a link has no profile and sees nothing. Names are taken from the join form only. An account created by hand in the Supabase dashboard cannot join with an invite, because it has no names.
7. Still open in `SPEC.md`: how weekly plans are set and edited (to add later), and the app name.
8. `npm run test:db` needs Postgres on the Mac (Homebrew). The script now looks in the Homebrew folders too, but this has not been run on the Mac yet.
9. Working setup: the build has run in cloud sessions, where the Supabase plugin could not connect (network policy). Davide may continue in a local session, where his installed plugins work. Read `CLAUDE.md`, `docs/SPEC.md`, `docs/DECISIONS.md` and this file first.
10. Reminders for attendance are not built. The in-app banner and the staff list of non answers exist. The reminder rules are decided (see `DECISIONS.md`) but need push notifications.
11. Events are shown to the chosen groups only. A coach who is not in a group sees the event but is not asked to answer.
12. Git on the shared folder leaves some harmless leftover files under `.git` (names starting with `stale-` and `tmp_obj_`). They can be deleted by hand.
