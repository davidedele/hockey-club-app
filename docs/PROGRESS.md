# Progress log

Update this file at the end of every session, so the next session starts exactly where this one stopped.
Keep entries short and put the newest first.

## Current state
Build step 1 (login, invite links, groups, members) is started. The database structure and its access rule tests are done. The app has the first screens, not yet tried against a real Supabase project.

## Session log
1. 21 October 2026, second session: database migration for groups, members, contacts, roles and invites with row level security. 70 access rule tests on a local Postgres (`npm run test:db`), all passing. App skeleton in React and TypeScript with Italian text file, login, join by invite, password reset, members list, own profile and invite management for staff. Type check, text tests and build pass. Decisions and assumptions added to `DECISIONS.md`. Setup notes in `docs/SETUP_TEST_PROJECT.md`.
2. 21 October 2026: specification, notes on the current app, decisions and working rules written. Repository created.

## Next
1. Create the Supabase test project, follow `docs/SETUP_TEST_PROJECT.md`, and try the screens on a phone.
2. Finish step 1 screens that are still missing: board editing of roles and group membership, removing a member.
3. Then step 2: events with weekly repeat, and attendance with reminders.

## Open problems
1. The Supabase connection from the cloud session failed (proxy 403), so nothing was tried against a real project. Only the local Postgres tests and the build were run. The screens have not been looked at in a browser.
2. The app is not yet installable as a real PWA: there is a manifest but no icons and no service worker. The service worker comes with push notifications (step 9).
3. Invite details (single use, 7 days) may be revisited. Davide prefers to refine them later.
4. A deleted member keeps their sign in account. Only the profile is removed, which blocks all access. Full account removal needs a server side step.
5. Still open in `SPEC.md`: how weekly plans are set and edited (to add later), and the app name.
6. Email changes: the contact email is copied from the account at joining and does not follow later changes.
