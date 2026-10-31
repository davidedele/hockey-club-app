# Fix brief 2: Davide's phone test of 1 November 2026

This brief comes after `docs/FIX_BRIEF.md`, whose Part A to D and E1 to E3 are done and merged (pull request 39). Item B13 of that brief (no messages in forms on iPhone) is still open and comes first in the order below. Every item here was raised by Davide on an iPhone with Safari, or came out of checking his remarks against the code on `main` at commit 7c7b0c9.

Nothing in this file has been fixed yet. Items marked "Decision" wait for Davide. Do not guess them: ask, and record the answer in `docs/DECISIONS.md`.

## How to use this brief

1. One session, one new branch from an up to date `main`, small commits, one item or one group of items per commit. Follow `AGENTS.md`: read `docs/UI_RULES.md` and `docs/UI_BACKLOG.md` before changing anything a member sees, and run the checklist at the end of the rules.
2. Where an item says "design first", show Davide a picture or a screenshot of the proposal and wait for his answer before building.
3. Run the type check, unit tests, build, database tests and `node scripts/ui-check.mjs` before every handover, and look at the screenshots at 375 and 1280 pixels. The checker cannot see the iPhone engine (WebKit): items marked "iPhone proof" must be tried by Davide on a real iPhone, or in a Playwright WebKit run on his Mac.
4. New remarks go into `docs/UI_BACKLOG.md` and new general rules into `docs/UI_RULES.md`, in the same change.
5. The next free migration number is 0036. Check `main` first.

## Order of work

1. B13 from the first brief (form messages), because sign up is the first thing every player does.
2. Part 1: the player view and staff view split, and the unanswered window.
3. Part 2: the bugs seen on the phone (bell, documents, absences, certificate date).
4. Part 3: wording and look (notifications wording, Per lo staff, group selector, Home style, club settings).
5. Part 4: the Campionato items.
6. Part 5: ideas, for Davide to pick from.

## Part 1. Player things in the staff view, and the unanswered window

### N1. Player things must not appear in the staff views

Davide: "when I'm in Membri I shouldn't see the 'Hai un evento senza risposta' ... since I'm in the staff view I don't think I should see this. The player things shouldn't be available in the staff view."

Found:
1. `src/App.tsx` lines 84 to 93, `PendingBanner`, hides itself on Home, Eventi, settings and profile pages and shows on every other page, including Membri, Presenze and Esercizi. It never looks at the chosen view (`view` in `src/lib/session.tsx`), so a board member in the Direttivo view sees it. This is why Davide saw it "only in Membri".
2. `src/components/Bell.tsx` and `src/lib/notifications.ts` add the unanswered events to the bell count in every view.
3. `src/components/DocumentsBanner.tsx` (the certificate and privacy line) also shows in every view.
4. The Home page in the staff view also keeps player elements (check `src/pages/Home.tsx`: next event with answer buttons).

Change: write one rule: in the Direttivo and Allenatore views nothing is asked of the person as a player. That covers the unanswered events banner, the unanswered count inside the bell, the answer buttons, and the person's own certificate and privacy banner. All of these appear in the Giocatore view. A person who is a player and a coach and wants their own reminders switches to the Giocatore view. Add the rule to `docs/UI_RULES.md` and a check to `scripts/ui-check.mjs` (staff view: no banner; player view: banner).

Decision (Davide): confirm the list, in particular whether the certificate and privacy banner is a "player thing" (my reading: yes, it is about the person's own paperwork). Also confirm what the bell shows in the staff views (announcements and discussion messages stay).

Proof: switch between the three views with a test account that has all roles. The banner, the bell count and the answer buttons follow the view, on every page.

### N2. The unanswered window is 14 days, Davide wants this week

Davide: "usually you can't answer for all the events coming in the next year, so I would stick to unanswered events this week", "it's not supposed to be 14 days, I don't even know sometimes if I'll be at the training next day."

Found: `src/lib/notifications.ts` line 6, `BANNER_DAYS = 14`. The banner texts say "nei prossimi 14 giorni" (`banner.one`, `banner.many` in `it.json`). The Eventi page heading "Da rispondere" counts every open future event (28 in the test), and the Home tile uses another window. The rule in `docs/UI_RULES.md` 3.3 says the same quantity must show the same number everywhere.

Decision (Davide): "this week" can mean the current week from Monday to Sunday (the week starts on Monday, decision in the spec), or the next 7 days. On a Saturday the first has almost nothing. My recommendation: the next 7 days. Also decide whether the Eventi page list shows only that window and puts the later events under a collapsed "Più avanti".

Change after the decision: one constant and one helper for the window, used by the banner, the bell, the Home tile and the Eventi heading, with texts that say the window ("nei prossimi 7 giorni"). The reminder emails (decided on 21 October: one the day before, more frequent when time is short) are separate and stay as they are.

Proof: with events at day 2, day 6 and day 10, the banner, bell, tile and heading all say 2, and the numbers are equal. A database comparison as in the earlier tests.

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

### N6. A certificate date can be saved without a certificate file

Davide: "I saw that the prova player has put a date for the certificate without the certificate being there."

Found: `src/pages/Documents.tsx` lines 200 to 207: the date form is always visible and the save button is enabled as soon as the date differs, with or without a file. The database allows it: the check of `member_documents` (migration 0014) only restricts the form of the file path, not whether a file exists. So a member can clear the "Manca il certificato" banner with a date alone, and the reminder emails (migration 0027, 60, 30 and 7 days before) would then follow a date that nobody checked.

Decision (Davide): what should count as a valid certificate?
1. A: both a file and a date are needed. The date field appears only after a file is uploaded. The photo reading fills the date. If the date is missing or unreadable, the member types it. Staff can set a date for a member only when a file exists.
2. B: as A, but staff may record a date without a file when they have seen a paper certificate.
My recommendation: A for members, and B for staff, with the status text saying "Visto dallo staff, senza file".

Change after the decision: `certificateState` in `src/lib/documents.ts` returns "in order" only when the rules are met. A date with no file shows the status "Manca il file" and keeps the banner. The Documenti column of the Members table, the Home figures and the reminders follow the same state. A database check (added as not valid, like migration 0035) makes the rule hold for every writer. Test each rule.

Proof: as a player, entering a date with no file leaves the banner on and the status says the file is missing. After uploading a file the date is accepted. As staff, the decided behaviour. Database test for the check.

## Part 3. Wording and look

### N7. Standard wording: "Notifiche", and check for similar cases

Davide: "Email del club should use more standardized wording like 'notifiche', check also for other instances where this is not done."

Found: `it.json` line 542 `reminders.title` "Email dal club", line 543 `reminders.label` "Ricevi le email del club", line 594 `ann.emailHint` and line 841 `club.groupIdentityHint` both say "email del club". The bell panel is titled "Novità" (`bell.title`), announcements are "Avvisi", reminders are "promemoria" in some texts.

Proposed glossary (Decision, Davide): "Notifiche" is the general word for what the app sends to a person, by email now and by push later. The bell panel is titled "Notifiche". The profile page where the person chooses what they receive is "Preferenze di notifica". "Avvisi" stays for the announcements that staff write. The word "email" appears only where the channel is the point (for example the switch "Ricevi le notifiche per email"). "Promemoria" is used only for the reminder about an event.

Change after the decision: put the glossary in `docs/UI_RULES.md`, then go through every text in `src/i18n/it.json` and the texts of the email functions (`supabase/functions/send-reminders/*.ts`) that mention email, notifiche, avvisi, novità, promemoria, reminder or messaggio, and make them follow it. Write the list of changed texts in the pull request.

Proof: a search of `it.json` for the old words returns only the intended uses. A screenshot of the bell and the profile page.

### N8. "Per lo staff" on the Home page

Davide: "I don't like the 'per lo staff' thing in the direttivo view."

Found: `it.json` line 904 `home.staff` = "Per lo staff", shown as the heading of a card in `src/pages/Home.tsx` lines 208 to 210 when the person is staff.

Decision (Davide): a better name. Options: "Da gestire" (my recommendation, it says what the card holds: people without an answer, and so on), "Squadra", or no heading with the figures shown as part of the page. With the split of N1 this card belongs to the staff views only.

### N9. The group selector looks different from the rest of the top bar on phones

Davide: "I don't like how the group selector is: it looks different from the rest of the top bar."

Found: in the phone top bar the group selector is a grey rounded rectangle with a text label and an arrow ("Tutti ▾", `src/components/GroupSwitch.tsx`, class `top-switch`), while the view switch, the bell, the gear and the profile picture are round icon buttons.

Design first: propose one family for all controls in the top bar: the same height (44 pixels), the same surface, border, radius and focus style, with the selected group shown as a short badge. Show Davide a picture of two options before building: (1) a round button showing the group letter (A, B, C1, C2, or an icon for all groups) that opens the same menu; (2) a pill with the group letter and an arrow in the same style as the others. Update `docs/UI_RULES.md` with the rule for top bar controls.

### N10. The hockey style is missing on the Home page

Davide: "The hockey style is missing in the home page, it's only in the event page."

Found: the event page has the coloured band (`ev-band`, the team colours, the big time and score). The Home page uses plain cards.

Design first: ask Davide what he means by the hockey style, with a reference if he has one. A proposal to show him: use the same band for the next event at the top of the Home page, keep the ice blue background, add a subtle rink line motif (centre line and a face off circle) in the header band, and use the club crest and the team colours. Show a picture of the Home at 375 and at 1280 before building, and check that it does not break rule 1.8 of the UI rules (no empty areas while loading).

### N11. Club settings: groups should not all be shown open

Davide: "for the club setting I told you to group them, so everything is not shown right away."

Found: `src/pages/ClubSettings.tsx` has three groups (`club-identity` at line 146, `club-colours` at 176, `club-docs` at 210) and they are all fully open. The backlog item 12 of 31 October ("no grouping") was marked done because the groups got headings, but Davide wanted them folded, so the page does not show everything at once.

Change: make each group a collapsible row with a one line summary when closed (for example "Nome e logo: Sgularat Milano", "Colori: 4 gruppi", "Documenti: informativa caricata"). One group open at a time, all closed on first load or the first one open (decide with Davide). Same behaviour on the groups page (`src/pages/GroupSettings.tsx`) when it has more than two groups of settings, and on the ice and rink settings. Add the rule to `docs/UI_RULES.md`. Reopen backlog item 12. The row must be a real button with `aria-expanded`, and the open state must not be lost when a save reloads the page.

Proof: screenshots at 375 and 1280 of each settings page closed and with one group open. Keyboard use works.

## Part 4. Campionato

### N12. A game of another team appears: Sgularat against Vikings, not of group A

Davide: "on the Campionato there is a game which is not of the Group A, it is Sgularat against Vikings."

Found, not yet explained: `src/pages/Championship.tsx` picks the group from the group selector, takes that group's league team (`group.league_team`) and the championships linked to it, and in the chip "Tutte le partite" shows every game of that championship (lines 64 to 77: `ours` compares the team name exactly, and `inComp` is every game of the chosen championship). A game "Sgularat against Vikings" would appear if the club has two teams in that championship, or if the same league team name is used for two of the club's squads, or if the group is linked to the wrong championship. The code cannot tell these apart.

To do: Davide sends a screenshot and says which group and which competition chip was chosen. Then check the test project data (read only): the `league_matches` rows of that championship, the `league_team` and `league_championships` of group A. Decision follows: either the group's link must name the competition and the exact team (so two squads with one name are told apart), or the game is simply another squad of the club in the same competition and the label must say so. Do not change the code before this is understood.

### N13. "Tutte le partite" is not all the games

Davide: "it says tutte le partite when it's obviously not all the partite, should be next or something like that, but you call it."

Found: `src/pages/Championship.tsx` line 13 `SHOWN = 10`, lines 76 and 77: the lists show the next 10 games and the last 10 results only. The chip `champ.allGames` ("Tutte le partite", `it.json` line 458) really means "games of all teams, not only ours", and the limit of 10 is not said anywhere.

Change (my call, as Davide asked): the two chips read "Tutte le squadre" and "Solo {squadra}". The headings read "Prossime partite" and "Ultimi risultati". Below each list a button "Mostra altre 10" shows more, and a line says how many are shown out of how many ("10 di 24"). Keep the same label rules as in `docs/UI_RULES.md`.

### N14. Championship statistics: top scorers, most assists and so on

Davide: "it would be fun to see also statistics for the championship, so other than the standings also a view for top scorers, most assists etc. for all the teams."

Found: what the app reads from the league website today (`supabase/functions/league-sync/parse.ts`, `league-match/match.ts`): fixtures, results and standings in bulk, and the details of one game (line ups, goals, penalties) when a member opens it. Nothing reads player statistics. Whether the league website has a statistics page is not known: the cloud session that wrote this brief cannot reach the site (the network policy answers 403 for `legahockeylibertas.it`).

Decision (Davide, 1 November 2026, message during the work): the app provides the results, so the summary of the statistics is done by us. Do not look for a ready made statistics page on the league website. The totals are computed by the app from the game data. This reading is an assumption and Davide should confirm it: for the club's own teams the data is what staff already enter in the app (goals, assists, penalties per player, migration 0012), and for all the other teams it can only come from the game details that the league website shows for each game.

Plan:
1. Check first what the game details of the league website really contain for other teams: scorers, assists, penalties, and whether players are named in the same way from game to game. This needs a session that can reach the site (the cloud environment must allow `legahockeylibertas.it`), or Davide's Mac. Write down what is available. If assists or penalties are not listed, say so, and show only what exists.
2. Build the totals from the game details. Each finished game is read once and its goals, assists and penalties stored in a new table (a migration with row level security, readable by members only, and a test for every rule). Totals per player and championship are added up from that table by a database function. The sync reads a limited number of new games per run, so the first filling is spread over several runs (the test calendar has 73 games).
3. Player names from other teams are matched as written by the league. If the same player is written differently, the totals split. State the limit on the page, and add a simple way for the board to merge two spellings if it turns out to matter.
4. Show tabs "Marcatori", "Assistenti", "Punti" and "Penalità" per championship, with the limit of rows and the "Mostra altre" button of N13. For the club's own players use the club's data when it exists, so the numbers do not disagree with the club's own statistics page.
5. Report the effort and the risks to Davide before building. Also check whether the privacy notice needs a line on public league data about players of other clubs.

## Part 5. What else needs to be added, or could be (for Davide to pick from)

Needed before real players use the app:
1. A separate production Supabase project for the club, kept apart from the test project. To my knowledge the free plan pauses a project after a period of inactivity and does not keep restorable daily backups, so the real club project likely needs a paid plan. Check the current plan terms. Also a written backup and restore routine, tried once.
2. Moving the members over from SportEasy: a way to load the member list (names, emails, groups) and send everyone an invite at once, since links are now made one at a time or per team. The spec does not say what history comes over (past attendance, results). Decide.
3. The privacy side: the final privacy notice (a draft exists), a way for a member to ask for their data or have it deleted, and a rule for how long old season data is kept. Deleting a member today removes only the profile, and the sign in account stays (known open problem in `PROGRESS.md`).
4. Email delivery tested to Gmail, iCloud and Outlook addresses, including the spam folder, and a check that the hourly reminder job really runs. A simple health check that warns the board when reminders stop.
5. A one page install guide for members with pictures (iPhone: Add to Home Screen, Android: install), and a short welcome screen after joining (photo, jersey number, position, phone, notifications).
6. Push notifications (step 9 of the spec). On iPhone they only work after the app is installed on the home screen, so this depends on item 5. Email is the only channel today.
7. A second board account, and two factor sign in for board accounts, since they can see all personal data. Switch on the leaked password protection setting noted in `PROGRESS.md`.
8. Error reporting, so a problem that happens on a member's phone reaches the maintainers.

Nice to have, in my order:
9. Season rollover: starting a new season (1 September): archive the old statistics, keep the history, move players between groups, review jersey numbers.
10. A read only copy of the next events on the phone when there is no signal at the rink (the service worker can keep the last schedule).
11. Player statistics inside the club: goals, assists and penalties per player per season, from the game numbers staff already enter, and a season MVP table.
12. Who is driving to away games (lifts), and what to bring (kit, jersey colour for the game; the jersey colour already exists).
13. An "add to calendar" button on one event, besides the calendar link of the whole feed.
14. English, as decided for later.

## Part 6. Test and proof list, after the fixes

1. The iPhone proof items (B13, N3, N4, N5) tried by Davide on a real iPhone with Safari, at the normal and a larger text size.
2. A new run of the whole interface checker, with WebKit added.
3. A second round against the test project as the board and the player, to check N1 and N2 with real data.
4. Update `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/UI_BACKLOG.md` and `docs/UI_RULES.md` in the same change.
