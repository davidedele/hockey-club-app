# Fix brief 2: Davide's phone test of 1 November 2026

This brief comes after `docs/FIX_BRIEF.md`, whose Part A to D and E1 to E3 are done and merged (pull request 39). Item B13 of that brief (no messages in forms on iPhone) is still open and comes first in the order below. Every item here was raised by Davide on an iPhone with Safari, or came out of checking his remarks against the code on `main` at commit 7c7b0c9.

Nothing in this file has been fixed yet. Davide answered the open questions on 1 November 2026 and they are recorded as decisions 92 to 102 in `docs/DECISIONS.md`. Items still marked "Decision" wait for Davide. Do not guess them: ask, and record the answer in `docs/DECISIONS.md`.

## How to use this brief

1. One session, one new branch from an up to date `main`, small commits, one item or one group of items per commit. Follow `AGENTS.md`: read `docs/UI_RULES.md` and `docs/UI_BACKLOG.md` before changing anything a member sees, and run the checklist at the end of the rules.
2. Where an item says "design first", show Davide a picture or a screenshot of the proposal and wait for his answer before building.
3. Run the type check, unit tests, build, database tests and `node scripts/ui-check.mjs` before every handover, and look at the screenshots at 375 and 1280 pixels. The checker cannot see the iPhone engine (WebKit): items marked "iPhone proof" must be tried by Davide on a real iPhone, or in a Playwright WebKit run on his Mac.
4. New remarks go into `docs/UI_BACKLOG.md` and new general rules into `docs/UI_RULES.md`, in the same change.
5. The next free migration number is 0036. Check `main` first.

## Order of work

1. B13 from the first brief (form messages), because sign up is the first thing every player does.
2. Part 1: the player and staff view split, and the unanswered window.
3. Part 2: the bugs seen on the phone (bell, documents, absences, certificate rule).
4. Part 3: wording and look (notifications wording, Da gestire, group selector, Home style, club settings).
5. Part 4: the Campionato items.
6. Part 5: the features Davide approved, in this order: push notifications, deleting a member's data, two factor sign in for the board, the production database.
7. Part 6: ideas by role, for Davide to pick from.

## Part 1. Player things in the staff view, and the unanswered window

### N1. Player things must not appear in the staff views

Davide: "when I'm in Membri I shouldn't see the 'Hai un evento senza risposta' ... since I'm in the staff view I don't think I should see this. The player things shouldn't be available in the staff view." Answer on 1 November: "for example being present to the game/training, I don't know if there is something else." (decision 93)

Found:
1. `src/App.tsx` lines 84 to 93, `PendingBanner`, hides itself on Home, Eventi, settings and profile pages and shows on every other page, including Membri, Presenze, Esercizi and Campionato (a screenshot of Davide's shows it on a Campionato game page in the Direttivo view). It never looks at the chosen view (`view` in `src/lib/session.tsx`).
2. `src/components/Bell.tsx` and `src/lib/notifications.ts` add the unanswered events to the bell count in every view.
3. `src/components/DocumentsBanner.tsx` (the certificate and privacy line) shows in every view.
4. The Home page in the staff view keeps player elements (check `src/pages/Home.tsx`).

Change: in the Direttivo and Allenatore views, everything about being present at an event is hidden: the unanswered events banner, the answer buttons and the "La tua risposta" box, and the pending count inside the bell. They appear in the Giocatore view. A person who is a player and a coach and wants the reminders switches to the Giocatore view. Davide named only this one group of things. Claude's default for the rest: the certificate and privacy line is about the person's own paperwork and stays visible in every view, and the bell keeps announcements and discussion messages. Ask Davide to confirm this default in one line when the item is shown. Add the rule to `docs/UI_RULES.md` and a check to `scripts/ui-check.mjs` (staff view: no banner; player view: banner).

Proof: switch between the three views with a test account that has all roles. The banner, the bell count and the answer buttons follow the view, on every page.

### N2. The unanswered window is 14 days, Davide wants this week

Davide: "usually you can't answer for all the events coming in the next year, so I would stick to unanswered events this week", "it's not supposed to be 14 days, I don't even know sometimes if I'll be at the training next day." Decision on 1 November: the calendar week (decision 92).

Found: `src/lib/notifications.ts` line 6, `BANNER_DAYS = 14`. The banner texts say "nei prossimi 14 giorni" (`banner.one`, `banner.many` in `it.json`). The Eventi page heading "Da rispondere" counts every open future event (28 in the test), and the Home tile uses another window. The rule in `docs/UI_RULES.md` 3.3 says the same quantity must show the same number everywhere.

Change: the window runs from now until the end of Sunday, in Italian time, so it ends at the next Monday 00:00. On Monday it shows the whole new week, and on Sunday evening it can be empty. One helper and one constant are used by the banner, the bell, the Home tile and the Eventi heading, and the texts say the window ("questa settimana"). The Eventi page shows the events of the week under "Da rispondere" and puts the later ones under a collapsed "Più avanti". The reminder emails and pushes (decided on 21 October: one the day before, more frequent when time is short) are separate and stay as they are.

Proof: with events at the start of the week, at the end of the week and in the next week, the banner, bell, tile and heading all give the same number, and the numbers equal a database count. Test the Sunday to Monday change and the clock change of late March and late October.

## Part 2. Bugs seen on the phone

### N3. The notification panel is off the left side of the screen and does not close when tapping outside

Davide: "when I open the notification page it is not centered and it goes out on the left side of the screen", "I would like the notification window to close when I press outside the window, not only when I press again on the notification symbol."

Found: `src/styles.css` line 751: `.bell-list { position: absolute; right: 0; width: min(20rem, calc(100vw - 2rem)); ... }` is anchored to the bell button. On phones the gear and the profile picture sit to the right of the bell, so a panel up to 320 pixels wide, aligned to the bell's right edge, runs past the left edge of the screen. `src/components/Bell.tsx` uses a `details` element: it closes only by tapping the button again, or when the route changes.

Change: on phones, show the panel under the top bar with a margin of 1rem on both sides (fixed position, full width minus the margins), so it is centred and always inside the screen. On computers keep it anchored under the bell. Close it on a tap outside, on Escape, and after following a link. Return the focus to the bell button when it closes. Keep it usable by keyboard and screen reader.

Proof: Playwright at 320, 375 and 430 pixels and at 1280: the panel is fully inside the viewport, a click outside closes it, Escape closes it. Add these to the interaction checks of `scripts/ui-check.mjs`. iPhone proof.

### N4. The date box in Documenti is wider than the page

Davide: "in documenti the visualization has problems, the box for the time is wider than the page."

Found: `src/pages/Documents.tsx` lines 200 to 207 hold the expiry date form: a label, a `type="date"` input, a hint and a button. `src/styles.css` line 70 gives every input `width: 100%` but nothing handles the date and time inputs of iOS Safari, which have an intrinsic minimum width and ignore `width: 100%` unless their container allows shrinking. There is no `min-width: 0` on the date fields or their containers, and there is no rule for `::-webkit-date-and-time-value`. The same fields exist in the event form (4 inputs, `src/pages/EventForm.tsx` lines 217 to 230) and the absence form (2 inputs).

Change: add one rule for all `input[type="date"]` and `input[type="time"]`: `min-width: 0; max-width: 100%; box-sizing: border-box; -webkit-appearance: none; appearance: none;` plus `::-webkit-date-and-time-value { text-align: left; min-width: 0; }`, and make the parents of these inputs shrinkable (`min-width: 0` on grid and flex children). Check every page that has a date or time input.

Proof (iPhone proof): on a real iPhone with Safari at the default text size and at a larger text size, no horizontal scrolling and no box wider than the page on Documenti, the event form and the absence form. Davide's Mac can also run the checker with Playwright WebKit (`npx playwright install webkit`, then add WebKit to `scripts/ui-check.mjs` as a second browser). Do this addition: it is the only way the checker can catch iPhone layout problems.

### N5. Absences: the start and end dates are too close to each other, and check everything for similar problems

Davide: "in profilo, assenze I don't like how the start date and end date are visualized, they are close one to the other, I want you to also check everything for similar problems."

Found: `src/styles.css` line 478: `.absence-dates { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }`, used by `src/components/AbsencePeriods.tsx` lines 77 to 87. Two date fields side by side on a phone are cramped, and iOS date inputs are wide.

Change: on phones stack the two fields one under the other, each with a full width label ("Dal", "Al"). On wider screens put them side by side with a gap of at least 1rem. Then audit every place where two fields share a row, and apply one rule. Places to check, from the style sheet and the pages: `.colours` (club colours, line 279), `.when-grid` (line 1173), the date and time fields of the event form, the team invite fields (days and number of people, `src/pages/Invites.tsx`), the ice hours and rink price forms, the game result fields, and the line-up and statistics forms. Rule to add to `docs/UI_RULES.md`: at phone width two fields share a row only when both are short (for example two times or two small numbers), and never two date fields.

Proof: screenshots at 375 of every form listed, and a note of what was changed in each.

### N6. A certificate date can be saved without a certificate file, and the validity rule

Davide: "I saw that the prova player has put a date for the certificate without the certificate being there." Answer on 1 November: "a valid certificate needs a certificate uploaded, checked with OCR, and the valid date (1 year after emission date)." (decision 94)

Found:
1. `src/pages/Documents.tsx` lines 200 to 207: the date form is always visible and the save button is enabled as soon as the date differs, with or without a file. The database allows it: the check of `member_documents` (migration 0014) only restricts the form of the file path.
2. The member types the expiry date ("Data di scadenza"), and the reader (`src/lib/expiry.ts`, `findExpiry`) looks for words like "scadenza", "scade il", "valido fino" near a date. The new rule needs the date of issue, not the expiry date.
3. The reader only runs on photos. For a PDF (`Documents.tsx` line 137: `!pdf`) nothing is read.
4. The reminder emails (migration 0027: 60, 30 and 7 days before) follow `valid_until`, so a date typed with no file would trigger reminders nobody checked.

The rule: a certificate is valid when a file is uploaded, the date of issue was read from it by the reader, and it is valid until one year after the date of issue. The member cannot just type a date.

Open points for Davide (my recommendation first):
1. When the reader cannot find the date, or the file is a PDF: the member types the date of issue, and the status says "Da verificare" until staff open the file and confirm or correct the date. The banner stays on until then. Alternative: refuse PDFs and ask for a photo only.
2. Staff may confirm or correct the date after looking at the file. Staff may not set a date when there is no file.
3. The date of issue is the date of the medical visit written on the certificate; the certificate is valid until the same day one year later. Confirm.

Change after the decision:
1. A migration: add `issued_on`, `verified_at` and `verified_by` to `member_documents`, make `valid_until` follow `issued_on` plus one year, and add a check (not valid first, like migration 0035) that a certificate with a date has a file. Keep the existing test rows working. Test each rule.
2. The reader (`src/lib/expiry.ts`) looks for the date of issue, with its own keywords (for example "data", "visita", "rilasciato", "emesso") and plausible dates; add tests with sample texts of real looking certificates.
3. The Documents page: the date field appears only after a file is uploaded, shows what the reader found and lets the member correct it; the states are missing, to verify, valid until (date), expiring within 30 days, expired. `certificateState` in `src/lib/documents.ts`, the banner, the Members column and the Home figures follow the same states. The reminders use the same state.
4. Staff screen for the member: a button to confirm the date after opening the file.

Proof: as a player, a date with no file cannot be saved; after a photo upload the date of issue is read and the validity is one year later; a PDF gives "Da verificare"; as staff, confirming works and setting a date without a file is refused. Database tests for every rule.

## Part 3. Wording and look

### N7. Standard wording: "Notifiche", and check for similar cases

Davide: "Email del club should use more standardized wording like 'notifiche', check also for other instances where this is not done." Davide asked Claude to suggest the rest (decision 100).

Found: `it.json` line 542 `reminders.title` "Email dal club", line 543 `reminders.label` "Ricevi le email del club", line 594 `ann.emailHint` and line 841 `club.groupIdentityHint` say "email del club". The bell panel is titled "Novità" (`bell.title`), announcements are "Avvisi", and "promemoria" appears in some texts.

Glossary (decided): "Notifiche" is the general word for what the app sends to a person, by push and by email. The bell panel is titled "Notifiche". The profile page where the person chooses what they receive is "Preferenze di notifica". "Avvisi" stays for the announcements that staff write. The word "email" appears only where the channel is the point (for example "Ricevi le notifiche per email"). "Promemoria" is used only for the reminder about an event.

Change: put the glossary in `docs/UI_RULES.md`, then go through every text in `src/i18n/it.json` and the texts of the server functions (`supabase/functions/send-reminders/*.ts`) that mention email, notifiche, avvisi, novità, promemoria, reminder or messaggio, and make them follow it. Write the list of changed texts in the pull request.

Proof: a search of `it.json` for the old words returns only the intended uses. A screenshot of the bell and of the profile page.

### N8. "Per lo staff" on the Home page

Davide: "I don't like the 'per lo staff' thing in the direttivo view." Davide asked Claude to suggest a name (decision 100).

Found: `it.json` line 904 `home.staff` = "Per lo staff", shown as the heading of a card in `src/pages/Home.tsx` lines 208 to 210 when the person is staff.

Change: the heading is "Da gestire", which says what the card holds (people without an answer, certificates to check, and so on). With N1 the card belongs to the staff views only.

### N9. The group selector looks different from the rest of the top bar on phones

Davide: "I don't like how the group selector is: it looks different from the rest of the top bar."

Found: in the phone top bar the group selector is a grey rounded rectangle with a text label and an arrow ("Tutti ▾", `src/components/GroupSwitch.tsx`, class `top-switch`), while the view switch, the bell, the gear and the profile picture are round icon buttons.

Design first: propose one family for all controls in the top bar: the same height (44 pixels), the same surface, border, radius and focus style, with the selected group shown as a short badge. Show Davide a picture of two options before building: (1) a round button showing the group letter (A, B, C1, C2, or an icon for all groups) that opens the same menu; (2) a pill with the group letter and an arrow in the same style as the others. Update `docs/UI_RULES.md` with the rule for top bar controls.

### N10. The hockey style is missing on the Home page

Davide: "The hockey style is missing in the home page, it's only in the event page." Answer on 1 November: "on the eventi we had the red line with the center like the center of a home rink." (decision 101)

Found: this is the red "now" line of the Eventi page: a red line with a small circle in the middle, like the centre line and centre circle of a rink (`.nowline` in `src/styles.css` lines 244 to 246, built from `::before`, `::after` and an `i` circle in `--now`). The Home page does not use it. `docs/DECISIONS.md` decision 85 records the look: ice blue with a red "now" line.

Design first: show Davide a picture of the Home at 375 and 1280 pixels with the line used in two places: above the next event ("adesso") and as the divider between this week and what comes after, and also as a thin line under the page header. Keep red for the "now" meaning only, as the colour rule says (red is for danger and errors, and the "now" line is the one exception), so use it at most once or twice per screen. Build it only after Davide has looked at the picture. Do not add anything that makes the page load slower or shows empty areas while loading (rule 1.8).

### N11. Club settings: groups should not all be shown open

Davide: "for the club setting I told you to group them, so everything is not shown right away."

Found: `src/pages/ClubSettings.tsx` has three groups (`club-identity` at line 146, `club-colours` at 176, `club-docs` at 210) and they are all fully open. The backlog item 12 of 31 October ("no grouping") was marked done because the groups got headings, but Davide wanted them folded, so the page does not show everything at once.

Change: make each group a collapsible row with a one line summary when closed (for example "Nome e logo: Sgularat Milano", "Colori: 4 gruppi", "Documenti: informativa caricata"). One group open at a time, all closed on first load or the first one open (decide with Davide). Same behaviour on the groups page (`src/pages/GroupSettings.tsx`) when it has more than two groups of settings, and on the ice and rink settings. Add the rule to `docs/UI_RULES.md`. Reopen backlog item 12. The row must be a real button with `aria-expanded`, and the open state must not be lost when a save reloads the page.

Proof: screenshots at 375 and 1280 of each settings page closed and with one group open. Keyboard use works.

## Part 4. Campionato

### N12. A game of another team appears: Sgularat against Vikings, not of group A

Davide: "on the Campionato there is a game which is not of the Group A, it is Sgularat against Vikings." On 1 November Davide sent a screenshot of a different game page (HC Fighters against HC Fanano, `/campionato/partita/48`), which helps N14 but is not the Vikings game. Still needed: a screenshot of the Campionato list that shows "Sgularat against Vikings", with the group and competition that were chosen.

Found, not yet explained: `src/pages/Championship.tsx` picks the group from the group selector, takes that group's league team (`group.league_team`) and the championships linked to it, and in the chip "Tutte le partite" shows every game of that championship (lines 64 to 77: `ours` compares the team name exactly, and `inComp` is every game of the chosen championship). A game "Sgularat against Vikings" would appear if the club has two teams in that championship, or if the same league team name is used for two of the club's squads, or if the group is linked to the wrong championship. The code cannot tell these apart.

To do: with the screenshot, check the test project data (read only): the `league_matches` rows of that championship, the `league_team` and `league_championships` of group A. Then decide: either the group's link names the competition and the exact team (so two squads with one name are told apart), or the game is another squad of the club in the same competition and the label says so. Do not change the code before this is understood.

### N13. "Tutte le partite" is not all the games

Davide: "it says tutte le partite when it's obviously not all the partite, should be next or something like that, but you call it."

Found: `src/pages/Championship.tsx` line 13 `SHOWN = 10`, lines 76 and 77: the lists show the next 10 games and the last 10 results only. The chip `champ.allGames` ("Tutte le partite", `it.json` line 458) really means "games of all teams, not only ours", and the limit of 10 is not said anywhere.

Change (my call, as Davide asked): the two chips read "Tutte le squadre" and "Solo {squadra}". The headings read "Prossime partite" and "Ultimi risultati". Below each list a button "Mostra altre 10" shows more, and a line says how many are shown out of how many ("10 di 24"). Keep the same label rules as in `docs/UI_RULES.md`.

### N14. Championship statistics: top scorers, most assists and so on

Davide: "it would be fun to see also statistics for the championship, so other than the standings also a view for top scorers, most assists etc. for all the teams." Confirmed on 1 November: the website gathers the information, and the app computes the summaries (decision 95).

What the league game page contains, from Davide's screenshot of `/campionato/partita/48` (HC Fighters 8 : 4 HC Fanano, Categoria A, 3 October 2026, Assago Forum):
1. Goals: time, team, scorer with shirt number and name, assist with number and name, and "in superiorità" for a goal in power play.
2. Penalties: time, team, player with number, the infraction, and the minutes (2:00 and so on).
3. Line-ups: per team, goalies, defenders and forwards with shirt numbers and names.
4. Not shown: shots, saves, plus and minus.

From this the app can total, per championship and player: goals, assists, points, power play goals, penalties and penalty minutes, and games played (from the line-ups). The data already comes through `league-match` when a member opens a game; the job is to read every finished game once and store it.

Plan:
1. Confirm in a session that can reach the league website (the cloud environment must allow `legahockeylibertas.it`, or run it on Davide's Mac) that every finished game has such a page, whether older games do too, and how the page marks a game without details.
2. Build the totals from the game pages. Each finished game is read once and its goals, assists and penalties stored in new tables (a migration with row level security, readable by members only, and a test for every rule). Totals per player and championship are added up by a database function. The sync reads a limited number of new games per run, so the first filling is spread over several runs (the test calendar has 73 games).
3. Player names from other teams are matched as the league writes them (team, shirt number and name together). If the same player is written differently, the totals split. Say so on the page, and give the board a simple way to merge two spellings if it turns out to matter.
4. Show tabs "Marcatori", "Assistenti", "Punti" and "Penalità" per championship, with the row limit and the "Mostra altre" button of N13. For the club's own players use the club's own data where it exists, so the numbers do not disagree with the club's statistics page.
5. Report the effort and the risks to Davide before building. Check whether the privacy notice needs a line about public league data on players of other clubs.

## Part 5. Features Davide approved on 1 November 2026

### P1. Push notifications

Davide: "yes definitely, no one looks at the mails." (decision 97) This is step 9 of the spec.

Plan:
1. Web Push standard. The app already registers a service worker in production (`/sw.js`, `src/lib/pwa.ts`); check what it does today. Add a table of push subscriptions per person and device (a migration; a person manages only their own, with tests), VAPID keys kept as secrets of the server function and never in the repository, and a server function that sends.
2. Reuse the logic of the hourly email job (`reminders_due`, the event notices, the announcements, the certificate alerts), so push and email follow the same rules: quiet hours at night, nobody who is "Non convocato", and the same texts as far as possible.
3. Channels: if a person has a working push subscription, send the push and skip the email for the same item, unless the person chose both. Without push, the email goes out as now. Preferences live on the page "Preferenze di notifica" (N7), per kind (reminders to answer, changes and cancellations, announcements, discussion messages, certificate expiry) and per channel.
4. What to send first: the reminder for events without an answer (the day before and closer to the event), changes and cancellations, announcements, new discussion messages. Tapping a push opens the event with the answer buttons.
5. iPhone: Web Push works only for the app installed on the home screen (iOS 16.4 or later), and only after the person taps a button to allow it. So the preferences page shows a short instruction and an "Attiva le notifiche" button, only when the app is installed. This is the minimum of the install guide that Davide postponed (decision 99).
6. Android and computers: works in the browser after the person allows it.
7. Privacy: a push is shown on the lock screen, so keep it short and free of health data and of other people's names ("Allenamento giovedì: rispondi").
8. Tests: unit tests for building the messages, database tests for the subscription rules, removal of expired subscriptions, and a real try on one iPhone and one Android with the test project.

### P2. Deleting a member's data

Davide: "let's add it, just substitute their name everywhere with deleted user or something like that, you think" (decision 96). Claude's view: yes, replacing the name is the right idea for the history, but the name alone is not enough. The email, phone, photo, certificate files, calendar link and the sign in account are personal data and must be removed, not renamed.

Design:
1. Board only, from the member's page, in the confirmation window that names the person and says it cannot be undone. A member asking the board is enough for now.
2. One database function run by the board, in one transaction: the profile name becomes "Utente eliminato"; the jersey number, position and photo path are cleared; the contact row (email, phone), the documents rows, absences, calendar token, notification preferences and push subscriptions are deleted; the group memberships and roles are removed; open invites they created are revoked. A `deleted_at` mark stays. The club history (attendance, game numbers, ratings, line-ups) stays attached to the anonymous profile, so season totals do not change.
3. A server function (it needs the service role key inside the server, never in the app) deletes the files in storage (photo, certificate files) and the sign in account, so the person can no longer sign in and the email address is free.
4. Texts typed by other people that mention the person (discussion messages, announcements) are not changed; messages written by the person show "Utente eliminato" as author. The confirmation window says so. The league's public data about them is not ours.
5. The last board member cannot be deleted. A small record keeps the date and who ran it, with no personal data.
6. This replaces the open problem in `docs/PROGRESS.md` ("a deleted member keeps their sign in account").
7. Tests: after the deletion the person cannot sign in, no table has their name, email or phone, storage has no files in their folder, the statistics totals are unchanged, and only the board can run it.

Note: this is a sound technical approach, but it is not legal advice. With a team this small, a result row can identify a player by context, so ask the club's privacy contact whether keeping anonymous results is acceptable.

### P3. Two factor sign in for the board

Davide: "ok" (decision 98). Supabase supports an authenticator app code (TOTP) as a second step.

Plan:
1. A "Sicurezza" page in Profilo to enrol an authenticator app, for every account.
2. Board accounts must enrol within a grace period, then the second step is required at sign in. The database functions and rules for board actions check that the session passed the second step (the `aal` claim of the token), after the grace period.
3. Lockout risk: keep at least two board accounts, and write down how a board member's factor is reset (in the Supabase dashboard under Authentication, Users, by an owner of the project).
4. Tests with the test accounts: a board account without the second step is refused after the grace period; a player is not affected.
Do this after push notifications and before launch.

### P4. The production database

Davide asked: "Supabase?" Claude's recommendation (decision 102, to confirm): yes, the same service, a second project for the club on the Pro plan, kept apart from the test project.

What Supabase's own pages say (checked on 1 November 2026; the pricing page in the search result was an old copy, so check the live page before paying): free projects are paused after about 7 days of low activity and have no automatic backups; the Pro plan costs from 25 dollars a month, is not paused for inactivity, and keeps the last 7 days of daily backups; point in time recovery is a paid extra. Sources: [Project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Free plan backups](https://supabase.com/kb/faqs/platform/free-plan-backups), [Database backups](https://supabase.com/docs/guides/platform/backups), [Pricing](https://supabase.com/pricing).

Plan:
1. Create the project (Pro plan) with the club's own account as owner, and a second owner for safety.
2. Apply all migrations in order, deploy the four server functions, set the secrets (reminder secret, email key, push keys) in the project and never in the repository, connect the custom email sender, set the redirect addresses of the real site, and create the first board account with the bootstrap script.
3. The app build for real use gets the production address; test builds never do. Never connect any test session to it.
4. Backups: the daily backups of the plan, plus a monthly dump with the Supabase command line tool stored outside Supabase, and one restore tried into a scratch project.
5. Before members join: the privacy notice final, the second board account, two factor sign in (P3), and the leaked password protection setting switched on.

## Part 6. Ideas by role, for Davide to pick from

Player:
1. A page "La mia stagione": attendance percentage, games, goals, assists, penalties, average rating received and MVP votes, per season. The data already exists.
2. "Arrivo in ritardo" and "Esco prima" as a note on an answer, with a reason, so the coach knows in advance.
3. Lifts for away games: who drives and how many seats.
4. The address of the venue with a button that opens it in the maps app, with notes for parking and the entrance.
5. A button to add one event to the phone calendar.

Coach:
6. Warnings before an event: no goalie has answered present, or fewer than a minimum number of skaters (set per group) the day before. The positions already exist.
7. Fast attendance at the rink: everyone answered present starts as present, and the coach taps the exceptions; it works with a weak signal, saved on the phone and sent later.
8. Line-up helpers: copy the lines of the last training, suggest balanced lines from the positions, and flag a player whose certificate is expired (staff only).
9. Guests and call-ups for one event: add a player of another group to a single event without moving them, and a temporary link for a trial player.
10. Duplicate a training plan, tag and search drills, and the interactive drill board (step 10 of the spec). The drill diagram analysis Davide sent fits here: drills stored as structured data that can be animated.
11. A push to the people who have not answered (the button exists for email today).

Board and staff:
12. A "fit to play" list before a game: the certificate state of everyone on the game roster on one screen.
13. Season rollover and history: start a new season, archive the old one, move players between groups.
14. Polls (a dinner after a game, choosing a date for a club event) and more event types than training and game (social event, tournament, meeting).
15. An audit log of sensitive actions (roles, deletions, exports) for the board.
16. A club information page: rink addresses, the rules, the privacy notice and contacts.
17. Monitoring: a warning to the board when the reminder job or a server function stops.

Claude's top picks: 6, 7, 12, 4, 9, 1 and 2.

## Part 7. Test and proof list, after the fixes

1. The iPhone proof items (B13, N3, N4, N5) tried by Davide on a real iPhone with Safari, at the normal and a larger text size.
2. A new run of the whole interface checker, with WebKit added.
3. A second round against the test project as the board and the player, to check N1, N2 and N6 with real data.
4. A real push test on an iPhone with the app installed and on an Android phone (P1).
5. Update `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/UI_BACKLOG.md` and `docs/UI_RULES.md` in the same change.
