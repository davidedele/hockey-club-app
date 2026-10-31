# Fix brief

Written on 31 October 2026. It merges three sources into one ordered list of fixes, so one session can work through them in small steps:
1. `docs/AUDIT_FIXES.md` (branch `claude/busy-noether-1rz2di`): the code and security audit.
2. The test of the rules against the Supabase test project (branch `claude/charming-ride-yo6gpc`, first entry in `docs/PROGRESS.md`): 328 checks as board, player and signed out visitor.
3. The interface test in a browser (same branch, second entry): flows at 375 and 1280 pixels, light and dark, against `docs/UI_RULES.md`.

Nothing in this brief has been fixed yet. The line numbers are from `main` at commit d948542 and can move.

## How to use this brief

1. One session does all of it, on one branch started from an up to date `main`. Only one agent writes migrations at a time. The next free migration number is 0035, but check `main` and the open branches first.
2. Work in the order of the parts below. One small commit per item, each with its proof. Do not reformat files outside the item.
3. Before handing over: `npm run typecheck`, `npm test`, `npm run build`, the database tests (`npm run test:db`), and `node scripts/ui-check.mjs` once its fixtures file is in the repo (item E1). Look at the screenshots at 375 and 1280 pixels, as `AGENTS.md` asks.
4. Read `docs/UI_RULES.md` and the open items in `docs/UI_BACKLOG.md` before changing anything a member sees. Every new remark goes into the backlog and every new general rule into the rules, in the same change.
5. Any item marked "Decision" waits for Davide. Do not guess. Ask, and record the answer in `docs/DECISIONS.md`.
6. Test data on the test project is named `Prova QA`. Writes on the test project are allowed. Never touch the club's live data.
7. Update `docs/PROGRESS.md` at the end.

## Part A. Fix first: wrong or hidden information

### A1. Cancelling an event has no confirmation

Problem: the menu item "Annulla evento" cancels at once. Cancelling sets `cancelled_at`, and the change notice (migration 0024 treats "cancelled or back on" as a change) goes to the players. An accidental tap can tell everyone the game is off. UI rule 2.5.

Where: `src/pages/EventDetail.tsx`, the menu button around line 321 calls `setCancelled(!cancelled)` directly (the function is around line 158). The component for this already exists: `src/components/ConfirmAction.tsx`, used in `Invites.tsx`, `Documents.tsx`, `Profile.tsx` and `ClubSettings.tsx`.

Change: cancelling opens the same confirmation window, naming the event and its date and saying that the players will be told. Annulla is focused, Escape closes it. Reactivating can stay immediate, but the text should say that players are told again. Texts go in `src/i18n/it.json` next to `event.cancel`.

Proof: a Playwright run as the board: open the menu, choose cancel, the window names the event, Escape leaves the event active, confirming cancels it. Check `events.cancelled_at` in the database.

### A2. Deleting an event uses an inline panel, not the window

Problem: deleting an event opens an inline panel. Escape does not close it, Annulla is not focused, two red buttons sit side by side and the header jumps. Revoking an invite uses the correct window, so two screens disagree. UI rule 2.7.

Where: `src/pages/EventDetail.tsx`, the `confirming` state and its panel around lines 355 to 370. The options (only this event, this and the following) must stay.

Change: use the same window component, with the two choices inside it where a series is involved. Keep the text that names the event and the date (`event.deleteConfirm`).

Proof: Playwright: Escape closes, Annulla has focus, the database matches after deleting one event and after deleting this and the following.

### A3. Deleting an announcement or a drill asks "Conferma l'eliminazione" without naming it

Problem: the second step shows a red button with a generic text. UI rules 2.5 and 2.7.

Where: `src/pages/Announcements.tsx` line 136 (`ann.confirmDelete`) and `src/pages/Drills.tsx` line 233 (`drills.confirmDelete`).

Change: use the confirmation window component, with a title and body that name the announcement or the drill.

Proof: Playwright, as for A2.

### A4. Tables are cut at the card edge, with no hint

Problem: at 1280 pixels the attendance summary loses its last column (Presenza %), and the members table cuts the Documenti column and long email addresses. At 375 the game statistics table is cut (Parate, Media voti, MVP) with no hint to scroll. Only the attendance grid has the scroll hint. UI rules 4.1 to 4.4. Information is hidden, which makes this the most visible problem for coaches.

Where: the attendance summary page, the members table (`src/pages/Members.tsx`) and the game statistics table in `src/pages/EventDetail.tsx`. Find how the attendance grid does its scroll hint and reuse it. Check the layout rules in `docs/UI_RULES.md` section 4 before choosing: scroll with a hint, narrower columns, or hiding a column on small widths.

Proof: `node scripts/ui-check.mjs` and screenshots at 375 and 1280 of each table with the full set of columns visible or clearly scrollable. A long email address wraps or truncates with the full value available.

### A5. "Presenti (0)" on a finished game

Problem: after a game, staff record who actually came, but the list and the counter follow the answers given before. A finished game shows "Presenti (0)" when staff recorded attendance and nobody answered. The event page also shows "0 Presenti" in the counters and "Presenti (0)" again as the list heading (UI rule 1.6).

Where: `src/pages/EventDetail.tsx`: `present` (line 181) and `going` come from the answers; `event_present_people` is called around line 74; the counter at line 402 and the heading `event.presentList` at lines 409, 445 and 476.

Decision (Davide): after the event has ended, "Presenti" means the people the staff recorded as on time or late. Before the event it means the people who answered present. If no attendance has been recorded yet, show the answers and say so. Confirm this before building.

Change after the decision: choose the source by whether the event is over, drop the duplicate counter or heading so the number appears once, and keep migration 0033 semantics (a person marked "Non convocato" is never counted as present). This may need a small database function change in migration 0035.

Proof: Playwright and database check on a finished game with recorded attendance and no answers: the list and the counter show the recorded people.

### A6. Score order differs between two screens for an away game

Problem: the event header shows the score home side first (2 : 4 for an away game), while the strip of recent results shows our score first (4 : 2). Not a data error, but it looks like one.

Where: `src/pages/EventDetail.tsx` lines 261 to 263 build `sides` and `scores` home first. `src/components/TeamStats.tsx` line 107 shows `score_for : score_against`.

Decision (Davide): one convention everywhere. A common rule: where both team names are shown, the home side is first. Where only the club's own result is shown (for example a W, D or L strip), show our score first and say so in the label. Confirm, then apply the same rule on the Home page and the Championship page.

Proof: for an away game with a known result, the same score reads the same on every screen that shows both names.

## Part B. Consistency with `docs/UI_RULES.md`

B1. Rule 3.2: the attendance grid still says "Mese prima" and "Mese dopo" (`grid.prev`, `grid.next` in `it.json`, lines 555 and 556). The backlog marks this item as done, so fix the text and check the backlog entry.

B2. Rule 4.3: zeros and empty values must be an en dash. The game statistics table shows 0 for goals and blanks for Media voti and MVP. The attendance summary shows 0% in Presenza. Decide with the rule's exact wording which values become a dash.

B3. Rule 1.4: on the announcements page at 1280 pixels the breadcrumb reads "Sgularat / Avvisi / Avvisi". Remove the duplicate.

B4. Rule 2.3: five groups (A, B, C1, C2 and the club wide group) are shown as chips in the event form, the announcement form and the group filters. The rule says a menu above four options. Decision (Davide): apply the rule, or change the rule for groups, because chips are quicker to tap. Record the answer.

B5. Rule 1.8: the event form shows the labels Pista and Gruppi with nothing under them for about 2.5 seconds on a fresh load, and the player's event page shows the line "Caricamento..." instead of a skeleton. Use the skeleton pattern the rules describe.

B6. Rule 2.1: at 1280 pixels the breadcrumb links are 16 pixels high and "Gestisci le presenze" (`event.manage`) is 17 pixels. The minimum is 44.

B7. Rule 3.3: the heading "Da rispondere 28" on the Eventi page has no time span, while the banner says 7 for 14 days. The numbers are right but the heading must say what is counted.

B8. Name order: the sidebar shows "Prova Giocatore", the lists show "Giocatore Prova". Use one order everywhere, according to the name rule in `docs/UI_RULES.md`.

B9. A one tap answer in the list gives no "Risposta salvata" message (the text exists in `it.json`). The button "Invia voti" stays disabled until an MVP is chosen and nothing says why. Add a short hint under the button.

B10. The bell shows "Allenamento: 1 nuovo messaggio" with no date, so two trainings cannot be told apart. Add the date.

B11. On phones the three dots button of the event band drops to its own row when the date line is long. Keep it on the first row.

B12. After creating an event, the phone goes to the Eventi list and the computer goes to the new event page. Pick one behaviour. Decision (Davide), or follow the rule if it exists.

B13. The browser's own validation bubble is the only message for a missing date or time. In the test it was English, because it follows the browser language. Check on a real Italian phone. If it is English there too, replace it with the app's own Italian messages.

B14. The members table and others still show digits in the old test names `3 Prova` and `5 Prova`. This is expected after migration 0034 and only needs the old test rows to be corrected on the test project. Not a code fix.

## Part C. Dark mode

C1. The red bell badge fails contrast (3.0 to 1).

C2. The round S (3.0) and V (1.9) of the last five games on the Statistiche page fail contrast.

C3. The event header band turns light blue in dark mode with white text and looks weak. The script could not measure it, because the background is a gradient. Measure by taking a screenshot and sampling pixels, or choose a darker band colour in dark mode.

Proof: the contrast check of the interface checker in dark mode has no failures, and the band is readable by eye.

## Part D. Database items, in one migration

Use one new migration (0035 if still free) and add a test for every rule, as `AGENTS.md` requires.

D1. The database accepts an event of 20 hours while the app refuses more than 12. Add a check that matches the app. Existing rows must not break the migration: check the data first.

D2. A phone number such as "abc" is accepted. Add a format check in line with the phone format decision in `docs/DECISIONS.md`. Empty must stay allowed.

D3. Decision (Davide): staff can place a person marked "Non convocato" in a line-up. The app does not offer such people. Should the database refuse it too? A coach may have a reason, so ask.

D4. Decision (Davide): discussion messages can be posted on cancelled and finished events. Probably fine, since people talk after a game. Confirm.

D5. Everyone who is signed in can start the league update. It is limited to once every three hours, and only staff can force it. Probably intended. Confirm.

## Part E. Tooling and security notes

E1. The interface checker cannot run from a fresh copy. `.gitignore` line 7 `ui-check/` also matches `scripts/ui-check/`, so `fixtures.mjs` was never committed. On Davide's Mac: change the line to `/ui-check/`, check that `scripts/ui-check/fixtures.mjs` exists, run `git check-ignore -v scripts/ui-check/fixtures.mjs` (must print nothing), and commit the folder. See fix 1 in `docs/AUDIT_FIXES.md`. This item comes before the others in this part, and before any item that must be proved with the checker.

E2. `scripts/test-db.sh`: the file is stored without the executable bit, so `npm run test:db` fails with "Permission denied" on a fresh copy. Change the script line in `package.json` to `bash scripts/test-db.sh`. Also on Linux line 8 stops silently when no Homebrew Postgres folder exists. Add `|| true` inside the `ls ... | sort -V | tail -1` part. See fix 2 in `docs/AUDIT_FIXES.md`. Workaround until then: `PG_BIN=/usr/lib/postgresql/16/bin bash scripts/test-db.sh`.

E3. Calendar text: `supabase/functions/calendar-feed/ics.ts`, `escapeText` leaves a lone carriage return. Replace `.replace(/\r?\n/g, '\\n')` with `.replace(/\r\n|\r|\n/g, '\\n')` and add a case to `src/lib/ics.test.ts`. This was reproduced on the test project. Risk is low, because only staff calling the database directly can store such a character. After the code fix, deploy the changed function to the test project.

E4. Decision (Davide): the certificate reader loads its engine from cdn.jsdelivr.net. Measure the real size of the files needed (core variants and the Italian language file) first. If the size is acceptable, host them in `public/` and pass `workerPath`, `corePath` and `langPath` to `createWorker` in `src/lib/ocr.ts`. If not, keep the CDN. See fix 4 in `docs/AUDIT_FIXES.md`.

E5. Optional: add a Content-Security-Policy header in `netlify.toml`, first as report only, tested on every page. See fix 5 in `docs/AUDIT_FIXES.md`. It must allow the Supabase project, storage images, `data:` and `blob:`, and the CDN until E4 is done.

E6. Optional: the team invite form in `src/pages/Invites.tsx` starts with 30 days. Start with 7 days and a smaller number of uses. Davide accepts the current design.

## Part F. Not tested yet

1. Sign up with the email confirmation. This is how every player joins, so it must be tested before the move from SportEasy. It needs Davide: a person clicks the link in Gmail (plus addresses work). Test the invite link, the confirmation email, the first login, and a team link.
2. All emails: reminders, announcements, event notices and the "Ricorda a chi non ha risposto" button. Test only with addresses owned by Davide.
3. The certificate photo reading, a PDF upload from a phone, push notifications, and installing the app on an iPhone and an Android phone.
4. A real mouse drag between the attendance columns on a computer. Playwright could not start the drag, so only the drop logic was proven. Davide can test this by hand in a few minutes.
5. The league pages and the league update function from the published app.
6. The browser validation text on an Italian phone (item B13).

## Part G. Cleaning up

1. The test project holds data named `Prova QA`: about ten events with answers, attendance, game numbers and one MVP vote, a plan, a drill and discussion messages. Remove it at the end, or keep it for the next test round. Davide decides.
2. The test player's phone number is empty, and both test accounts have new calendar links.
3. The two test reports are on the branch `claude/charming-ride-yo6gpc` and the audit notes are on `claude/busy-noether-1rz2di`. None of them is on `main`. Merge them, or copy the useful parts into `docs/PROGRESS.md` on the fix branch.

## Suggested order

1. E1 (Davide, Mac), then E2.
2. A1, A2 and A3 together: one confirmation window component for all removals.
3. A4 (tables), then A5 and A6 after Davide's decisions.
4. Part B in small groups, then Part C.
5. Part D in one migration after Davide's decisions on D3 to D5.
6. E3, then E4 to E6 after Davide's decisions.
7. Part F with Davide, before real players use the app.
