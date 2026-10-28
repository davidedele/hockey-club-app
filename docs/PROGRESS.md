# Progress log

Update this file at the end of every session, so the next session starts exactly where this one stopped.
Keep entries short and put the newest first.

## Current state
Migrations up to 0015 are applied to the Supabase test project (0012 to 0015 on 22 October, by Davide in the SQL Editor, from one file with a check that stops on the wrong project or a second run). Security advisors after that: row level security on every table; `league_ignored` has no policies on purpose, since only the league function and triggers use it. The league-sync server function is not deployed yet, so the Campionato page stays empty until it is. The weekly limit was dropped on 28 October.

## Session log
0. 28 October 2026, online test version (branch `claude/deploy`): Netlify settings in `netlify.toml` and the steps in `docs/DEPLOY.md`. The test copy uses the Supabase test project only.
0. 28 October 2026, calendar feed (branch `claude/calendar-feed`): migration 0018 (token table, own token and new token functions, feed function for the server), 20 database tests (every new rule made a test fail when broken: open token policy, feed function open to signed in users, group filter dropped, old token kept, 60 day limit removed), server function `calendar-feed` with the ICS builder (`ics.ts`, unit test `src/lib/ics.test.ts`), and a Calendario block in Profilo. The steps to put it online are in `docs/SETUP_CALENDAR_FEED.md`.
1. 21 October 2026, third session (local, Davide away):
   1. Staff screen to edit a member: group membership (coaches and board), roles and removing a member (board only), with a named confirmation.
   2. Invite page no longer flashes the working text while the session loads. The "use this invite" button logic was reviewed and the database side is covered by tests. It still needs one real click in the browser.
   3. PWA install icons added and linked in the manifest and the page head.
   4. `docs/SETUP_EMAIL.md` written. The email sender itself still needs Davide.
   5. Step 2 database migration `0002_events_attendance.sql` with 71 new access rule tests (141 in total, all passing), including a check that weekly repeats keep the clock time across the autumn time change and a check that breaking two rules makes the tests fail.
   6. Step 2 screens: events list, new and edit event form, event page with Present and Absent answers, banner for unanswered events, staff list of who has not answered, recording who actually came, final score for games, deleting one event or this and the following.
   7. Looked at all screens at 375 and 1280 pixels wide with a fake backend: no sideways scrolling, tap targets at least 44 pixels, polish fixes applied. Not tried against the real Supabase project.
   8. Coach screens: "Da contattare" (who has not answered, with phone and email) and "Riepilogo presenze" (per player summary), both reached from the Events tab. Migration `0003_staff_attendance_lists.sql`, 19 more tests (160 in total, all passing). It was applied to the test project through the Supabase connection, after checking it was the only project, `hockey-club-test`.
   9. Visual redesign after Davide found the first look too plain: rink schedule board style with Barlow fonts bundled in the app, a date column per day, an accent rule on events that need an answer, tab icons and a matching dark mode. Checked at 375 and 1280 pixels in light and dark with the fake backend. Choices are in `DECISIONS.md`.
   10. After comparing with SportEasy (app and website), the chosen look was built: ice blue colours, week strip, the next event as a big panel with Presente and Assente, one tap answers on the following events, a black and yellow panel on game day, a floating tab bar on phones and a sidebar on computers. Migration `0004_present_counts.sql` (number of present answers per event) with 7 tests, 167 in total, all passing; applied to the test project. The tests were checked to fail when the visibility rule is removed.
   11. Players see who said present (migration 0005). Staff can set the club name, logo and game day colours in the app (migration 0006, storage bucket `club`). Both applied to the test project. 191 database tests, all passing, and each new rule was checked to make its tests fail when broken.
   12. Club settings and profile moved to the bottom of the sidebar, the week strip became a working calendar, and players can add a profile picture (migration 0007, applied to the test project). 203 database tests, all passing.
   13. Full code and security review, see `docs/SECURITY_REVIEW.md`. Three app fixes and migration 0008 (faster rules, two indexes), applied to the test project.
   14. Settings area (club, groups, invites), group settings for the board with migration 0009, cleaner own picture, and a computer layout with a week calendar and a members table. 220 database tests, all passing.
   15. UX and accessibility audit with fixes (`docs/UX_AUDIT.md`). Neutral sign in pages (migration 0010) and a club dashboard as the computer home with a dark sidebar. 221 database tests, all passing.
   16. `npm run test:db` now also finds Homebrew Postgres, or uses `PG_BIN`. The tests were run on a Linux copy because the shell used this session could not install Postgres in the usual way.
   20. Championship page and league games in the calendar (migration 0015, 46 tests, 406 in total, all passing; every new rule made a test fail when broken). Server function league-sync, with its page reading tried on the real league site in the browser. Migrations 0012 to 0015 and the function still need to go to the test project.
   19. Bureaucracy page per member with the medical certificate and the privacy consent (migration 0014, 39 tests), the board's privacy notice upload, a status column for staff in the members list and a reminder line for the member. The board names the two jerseys. 370 database tests, all passing; every new rule made a test fail when broken, apart from delete rules already covered by the read rules. Migrations 0012 to 0014 are not applied to the test project yet.
   18. Phone numbers shown as 333 123 4567. An idea board with 45 ideas and votes (an artifact on claude.ai). Jersey colour per game, absence periods (migration 0013, 35 new tests, 326 in total, all passing; each new rule made a test fail when broken, except the delete rule, which the select rule already covers) and WhatsApp sharing. Checked at 375 and 1280 pixels with the fake backend. Migrations 0012 and 0013 are not applied to the test project yet.
   17. Game statistics, ratings and MVP (build step 7, brought forward by Davide; the weekly limit waits). Migration `0012_game_stats_ratings.sql` with 64 new tests (288 in total, all passing), and 24 broken rule checks that each made a test fail. Staff enter goals, assists, penalty minutes and goalie numbers on the game page; players who played vote after the game; a Statistiche tab shows the season. Checked at 375 and 1280 pixels, light and dark, with the fake backend: no sideways page scrolling, no contrast failures, tap targets at least 44 pixels. Applying the migration to the test project was cancelled at the approval prompt, so it is not applied yet.
2. 21 October 2026, second session (cloud):
   1. Database migration for groups, members, contacts, roles and invites, with row level security. 70 access rule tests on a local Postgres (`npm run test:db`), all passing.
   2. App skeleton in React and TypeScript with the Italian text file: login, join by invite, password reset, members list, own profile, invite creation and revoking for staff.
   3. Test project created by Davide, migration applied, first board account created with `supabase/bootstrap_first_board.sql`, `.env` filled in. Steps are in `docs/SETUP_TEST_PROJECT.md`.
   4. Sign up errors now show the real reason in Italian.
   5. A signed in member who opens an invite link now has to press a button before the invite is used. Reason: Davide opened his own link while logged in and the old code used it up for his own account (confirmed in the invites table).
3. 21 October 2026, first session: specification, notes on the current app, decisions and working rules written. Repository created.

## Next
0b. Davide: set up the Netlify site and the address following `docs/DEPLOY.md`, then set the Site URL in the Supabase test project.
0a. Davide: apply migration 0018 and deploy the calendar-feed function to the test project (`docs/SETUP_CALENDAR_FEED.md`), then subscribe a phone calendar and check the events.
0. Deploy the league-sync function to the test project, link each group to its league team in Impostazioni, Gruppi, then try a real game: record attendance, enter numbers, vote from two accounts, look at Statistiche and Campionato.
1. Done by Davide: the step 2 migration is applied in the test project and was tried (events, answers exist). Security advisors checked: row level security is on for every table. The warnings about functions that signed in users can call are intended, since each function checks the caller itself. One setting to switch on in the dashboard: leaked password protection (Authentication, password security), if the plan allows it.
2. Davide: the Resend domain `mail.onlyai.lol` is verified. Enter the SMTP details in Supabase yourself (the API key stays private, never in the repository), following `docs/SETUP_EMAIL.md`, then switch "Confirm email" on and test a sign up.
3. Davide: click the "use this invite" button once as a signed in member (open an invite link while logged in).
4. Reminders, as decided on 21 October (see `DECISIONS.md`): push first, one reminder the day before a training, more frequent when time is short, managed by the board and managers, and a daily list of who has not answered for coaches. Push needs the service worker and push subscriptions (build step 9), so build that part together with the reminder rules. The coach list of who has not answered exists as a screen. A daily message with it comes with push.
5. The per event attendance grid (every player by every date, spec section 5). The per player summary exists.
6. Edit groups of an existing event, and change a whole series at once.
7. Ice hours per rink with a board recap and export (decided 28 October, replaces the weekly limit, which was dropped).

## Open problems
0. Before moving the club from SportEasy: decide between single use invites (today) and a team link per group usable by many people for a limited time, revocable by the board. Recommended: team link for the move, single use for individual cases. Davide: not urgent, there is time before the move.
1. In the Supabase test project, "Confirm email" is switched OFF for testing, because the built in email service allows only a few emails per hour. It must be switched on again and a custom email sender connected before real use. The confirmation email path has therefore not been tested yet.
2. The app is not yet installable as a real PWA: there is a manifest and icons but no service worker. The service worker comes with push notifications (step 9).
3. Signing up again with an address that already has an account (from an earlier attempt) sends no new email, and the resend button sends nothing either. The auth log shows a repeated sign up for that address and expired links from the first email. To look at later with Davide: probably the account is already confirmed, so the person should log in or reset the password, and the screen should say so.
4. Invite details (single use, 7 days) may be revisited. Davide prefers to refine them later.
4. A deleted member keeps their sign in account. Only the profile is removed, which blocks all access. Full account removal needs a server side step.
5. The contact email is copied from the account at joining and does not follow later changes.
6. A person who creates an account some other way than a link has no profile and sees nothing. Names are taken from the join form only. An account created by hand in the Supabase dashboard cannot join with an invite, because it has no names.
7. Still open in `SPEC.md`: how weekly plans are set and edited (to add later), and the app name.
8. `npm run test:db` needs Postgres on the Mac (Homebrew). The script now looks in the Homebrew folders too, but this has not been run on the Mac yet.
9. Working setup: the build has run in cloud sessions, where the Supabase plugin could not connect (network policy). Davide may continue in a local session, where his installed plugins work. Read `CLAUDE.md`, `docs/SPEC.md`, `docs/DECISIONS.md` and this file first.
10. Reminders for attendance are not built. The in-app banner and the staff list of non answers exist. The reminder rules are decided (see `DECISIONS.md`) but need push notifications.
11. Events are shown to the chosen groups only. A coach who is not in a group sees the event but is not asked to answer.
12. Git on the shared folder leaves some harmless leftover files under `.git` (names starting with `stale-` and `tmp_obj_`). They can be deleted by hand.
