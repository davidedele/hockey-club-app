# Event management review

8 November 2026. Branch `codex/event-management`.

## Changes

1. Staff list rows and phone event rows have an actions menu. Titles in the computer list also open the event. Board and Coach views show neither the own answer column nor own attendance.
2. Player view can consult the club calendar. Other groups' events use the existing neutral colours and "Non convocato". Attendance, messages, predictions and votes retain their participation checks. The next panel selects an eligible event, including an event already answered, so the answer can still be changed.
3. A folded detail visibility panel has separate choices for invited groups and other groups. Main schedule information stays visible. Staff retain access. Defaults preserve the invited groups' existing sections and show other groups only main information. A training does not offer the game statistics checkbox.
4. "Assegna i gruppi in seguito" creates a training without teams, including a weekly series. It shows "Gruppo non assegnato" and requests no attendance answers until teams are assigned. Booked rink hours still count.
5. Series actions cover one event, the selected event and following future events, or every future event in the series. Confirmation shows the count and date range. A series edit saves every field in one transaction. Historical occurrences are excluded from bulk changes. Repetition and bulk time changes keep Italian clock times through daylight saving changes.
6. Consultation never permits discussion posts or read receipts. Hidden sections are removed from the event tabs and their direct pages respect the chosen audience. The database enforces the same optional detail access for members without staff privileges. Staff switching to Player view get the corresponding interface, while the database still recognises their real staff privileges.
7. Small answer icons stay where labels would not fit. Wide rows can show Presente and Assente. Tables wrap longer names and keep actions visible. Month cards have larger targets and two lines for titles, with the full title in the accessible text and hover description.

## Test project update

1. Apply previous migrations through 0060 to the separate test project first. This branch adds `supabase/apply/apply_0061_event_management.sql`, a guarded transaction for the SQL Editor. Run the complete file once. It stops on a repeat and on a database missing its prerequisites.
2. Apply 0061 before deploying this app version to the test site. The new app uses `save_event`, `event_scope` and `manage_events` rather than separate writes for event fields and groups. After 0061, apply `supabase/apply/apply_0062_training_rink_address.sql` once. For a hosted release also redeploy `calendar-feed` so subscriptions omit legacy duplicate training addresses. Local screen review does not require deploying the function.
3. Use an ordinary player account from only one group and a separate staff account. A role switch on a staff account is useful for checking the interface but is not a substitute for testing database restrictions as a real player.
4. No hosted database changes, event deletions, emails, push notifications or changes to the older Tuesday series were made during development.

## How to try

1. In Board view, open Events, List. Open a row menu near the bottom of the table. Check edit, cancellation and deletion confirmation, including Escape and the initial focus on Annulla. Do not confirm a real deletion during review.
2. Edit a future training from a series, change its time and choose Questo e i successivi. Saving opens a count and date range first. Cancel once and check nothing changed. On disposable test data, confirm once and check times, venue, teams and visibility changed together, with historical events unchanged.
3. Create a weekly training with Assegna i gruppi in seguito. It should appear for consultation without answer buttons. Assign one occurrence to a group and check only that occurrence asks those players to answer.
4. In Player view, check an event of another group in the phone list, computer list and month calendar. It should be muted and explicitly labelled. It must not displace the next eligible event or add unanswered notifications.
5. Change another group's visibility to show only Formazione and Discussione. That group can read those sections but cannot post, record a read receipt, answer attendance, guess or vote. Main schedule details remain visible.
6. Hide an optional section from the invited groups and check its tab and direct page. Staff views must still show it. Answering Assente must not change the person's visibility audience.
7. Try larger text and dark mode on a phone and computer. Check long event titles, the pending group label, table actions and the series scope selector.

## Deliberately unchanged

1. Calendar subscriptions remain personal to the assigned groups for ordinary players. Existing staff subscriptions keep their club scope.
2. Members, league choices, season statistics and Fantahockey retain their existing group filters. The drill library and club season aggregates retain their existing access rules; hiding an event section does not remove a drill from the shared library or remove a player's contributions from season totals.
3. Installation instructions, notification configuration, theory event types and hosted test data cleanup are separate work. The 21:15 Tuesday series is the intended one; the older 21:30 series has not been removed.

## Review pictures

The pictures use invented sample data.

1. [Player calendar on a phone](ui-review/event-management/player-calendar-375.png).
2. [Detail visibility on a computer](ui-review/event-management/detail-visibility-1280.png).
3. [Staff actions at the bottom of the event list](ui-review/event-management/staff-list-actions-1280.png).
4. [Series confirmation before saving](ui-review/event-management/series-confirmation-1280.png).
5. [Compact next event panel on a computer](ui-review/event-management/home-compact-1280.png).
6. [Password visibility on a phone](ui-review/event-management/password-375.png).

## Validation

1. Type check and production build pass. Unit tests: 220 in 36 files.
2. Local database: 1704 checks pass, including a mid-series rollback, assignment changes, observers, hidden sections and daylight saving changes. Five deliberate breaks were all caught in disposable copies.
3. Guarded apply files: 81 checks pass, including applying 0061, refusing a second run and refusing a project missing its prerequisites.
4. Browser checks: standard page review covers 119 views at 375 and 1280 pixels with no page findings. Final calendar passes in dark mode with larger text and WebKit each cover 11 views including interactions, with no findings. Checks include own group choices and persistence, unassigned filters, locked rink addresses, password visibility, series confirmation and saving, keyboard focus, hidden tabs, observer discussions, pending creation and overnight end times. Earlier event review also covered 320 pixels. All automated browser data is invented.
5. Hosted migration application and a real phone check of the new version remain outstanding. No real data was changed during verification.

## Local review follow up

1. In Player view, the calendar menu lists only memberships, I miei gruppi for multiple memberships, and Tutti i gruppi. Check single membership and multiple memberships, choose I miei gruppi and refresh. Other sections keep their existing group limits.
2. Unassigned trainings remain in individual group and I miei gruppi calendar views, say Gruppo non assegnato and offer no attendance controls. Other groups' assigned events say Non convocato.
3. The next event card keeps its schedule together, uses its natural height, and has no red desktop divider. On phones the divider has no Adesso label.
4. Select an addressed rink on a training form: its address is visible and locked. Select a rink without an address or Nessuna: event location is editable again. Save disposable data and confirm the saved event, Maps, export and offline copy agree.
5. Login, registration and password reset have Mostra password and Nascondi password. Check the value stays intact and validation still treats the visible field as a password.
6. Open site checked in both Player and Board view at 375 and 1280 pixels without saving or deleting data. An unassigned event no longer describes the viewer as belonging to the wrong group, and Staff view no longer shows the personal no response message. Unassigned event sharing opens the event without asking for an attendance answer.
7. Data finding for review: Thursday 12 November has a 22:30 match against HC Black Angels and a 22:30 training, both visible in group A. No event data was changed. Consider a later overlap warning during creation and series editing; it should warn rather than block because parallel events for different groups can be intentional.
8. The exact downloadable 0062 package was checked on temporary PostgreSQL: READY FOR 0062, apply, both verification rows PASS, then ALREADY APPLIED. It contains before and after checks and the guarded update, which does not bulk rewrite existing events.
