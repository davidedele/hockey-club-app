# Club app interaction audit

Started 8 November 2026, completed 9 November 2026. Branch `codex/event-management`, PR 50.

## Scope and method

1. Exercise the app with independent Board, Coach and Player accounts in invented data, at 375 and 1280 pixels. Role checks use different role rows, rather than only hiding staff controls through the view menu.
2. Visit every distinct route in the interface inventory, including event tabs, member editing, attendance, league and club statistics, settings, profile, authentication and consultation states. Follow menus, folded sections and confirmation controls. Check disabled controls and inspect external link destinations without contacting those services.
3. Reset the sample database before each action, so saves, deletions and role changes cannot alter another test case. Block all external traffic; no real account, message, medical document or contact is used by the automated audit.
4. Record the control, role, width, route, actions that revealed it, requests, visible result and script errors. Browser test doubles cover clipboard, print and authentication setup. A request being issued is not by itself proof of a hosted service outcome; the specific regression checks below also assert the resulting state.
5. Run the established page layout, keyboard, confirmation, offline, visibility and series tests alongside the broader control inventory. Verify database permissions separately in disposable local PostgreSQL.
6. The earlier manual review on the open local site covered navigation, Staff and Player views, group choices, settings panels, member search and league filters. It was read only. That browser tab was no longer available when the final automated checks ran.

## Bugs fixed

1. Custom validation skipped declared input patterns, number steps and some input type errors after turning off native validation. Those rules now produce an inline explanation, mark the field invalid and focus it. Invalid group codes are stopped before a request.
2. Failed reads could look like an empty list or a missing record. Members, Events, Announcements, the league page and critical event and member editors now distinguish failure from empty data and offer Riprova. Announcement reads are not marked seen after a failed load.
3. A failed phone read in Profile could leave an empty field that was later saved over the stored number. Saving and phone editing now wait for a successful read, with a retry action. Profile updates require returned rows before displaying Salvato, and stop when the first update is refused.
4. Club and required document settings could offer editable defaults when the stored configuration had not loaded. Those editors now wait for the real configuration, with a retry on failure.
5. Changing the global group filter while editing an event could fetch the original event again and replace an unsaved draft. Filter changes no longer reload the edit. Event and member detail loading also rejects stale responses and prevents controls for an old record appearing under a new route.
6. Group and rink deletion used inline alert boxes without the standard keyboard behaviour. They now use the shared confirmation dialog, focus Annulla, close on Escape and return focus to the trigger. Print and CSV triggers also preserve focus consistently in WebKit.
7. Group name changes could remain stale in the global selector. Group settings now refresh its metadata. Adding or deleting a rink now invalidates the location cache, and a failed rink fetch is no longer cached as an empty successful result.

## Specific regression checks

1. Inject failed reads in both phone and computer layouts for the main lists, event detail and edit, member edit, club settings and required document settings. Check an error and retry appear, then restore the connection and recover without reloading the whole page.
2. Fail the profile phone query, attempt a form submit and assert no update is issued. Retry and check the stored sample phone returns before saving is enabled.
3. Enter an invalid group code and verify an inline error appears. Check pattern, numeric step, bad numeric input and URL format rules in unit tests.
4. Change the group selector during an event edit and verify the typed draft title remains.
5. Cancel group and rink deletion with Escape, checking initial and restored focus.
6. Rename a group in the sample backend and verify the global selector updates without a document refresh. Add a rink, navigate within the app back to Events and verify its name appears without a full refresh.
7. Confirm printing and check the print action runs. Confirm member CSV export and inspect the actual downloaded file and header. CSV escaping and formula handling also retain their unit tests.
8. Retain the existing series scope, transactional save, hidden section, consultation, attendance, offline privacy and keyboard regressions.

## Results

1. Main inventory: 354 role, route and width cases across 59 distinct routes. Board: 118 cases and 2,194 recorded checks; Coach: 118 and 1,840; Player: 118 and 1,185. Total: 5,219 records, with no unresolved script or action errors and no pending queued states.
2. Of those records, 203 inspect external links, 46 inspect disabled controls, 15 record downloads and two inspect file pickers. The others record changed states, handled validation or service messages, requests, or intentionally unchanged controls. These categories are kept separate from a claim that every click is a successful hosted transaction.
3. Focused contract rechecks add 111 control records for attendance state changes, calendar link renewal and a valid synthetic password recovery session. All three finish without script errors, action errors or error messages. They resolve first pass gaps where the sample backend returned an array for a void function, lacked a calendar token response, or had no recovery session. Sample authentication payloads were also corrected to match the client contract.
4. Full interface regression: 119 views at 375 and 1280, zero findings. WebKit profile and interaction regression: 21 views, zero findings. These include failed read and retry checks at both widths, draft preservation, profile phone protection, metadata refresh, delete confirmation focus, printing and an actual CSV download.
5. Type check, production build and all 225 unit tests in 37 files pass. The complete database permission suite passes 1,704 checks on temporary local PostgreSQL. No migration was changed by the audit.
6. The first broad suite exposed a test fixture that could move its only pending event past Monday 00:00. It now uses an ongoing, answerable sample event so a check crossing midnight does not produce a false failure. This was a fixture issue; the application week window was unchanged.

## Optional usability follow ups

1. Member contact details are tappable links on the computer table but plain text in the phone cards. Making phone numbers and email addresses tappable on phones would make contacting a member easier. Visibility would remain staff only.
2. Club statistics repeats the group choice inside the page even though it changes the global selector. Using one selector with a clear label for the group being summarised would be more consistent. Aggregate behaviour for players with multiple memberships should be decided together with that change.

## Limits and release status

1. No real emails, invitations, notifications or destructive actions were sent to the hosted project. Email delivery, push delivery, installation on an actual phone, the camera and real document recognition still require device and service checks. Installation and notification guidance remain deferred by Davide.
2. Authentication setup and storage actions in the audit use synthetic responses. Database tests verify permissions, but a mock button test does not certify a real authenticator enrollment, storage service or external league response.
3. The inventory is finite: sample records, reachable controls and bounded nested states, rather than every possible data set, browser extension or network condition. Interrupted runner cases and mock service gaps were rechecked or classified separately from product bugs.
4. These fixes require no new database migration. The existing 0061 and 0062 migrations and `calendar-feed` release remain tracked in `docs/DEPLOY.md`.
