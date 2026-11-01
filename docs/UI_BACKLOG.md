# UI backlog

Every point Davide raised about the interface, with its status. Newest review first. When a point is done, write the pull request next to it; when it turns into a general rule, the rule goes in `docs/UI_RULES.md`.

Status words: Open, In progress, Done (PR number), Decided (waiting for Davide), Won't do (with the reason).

## Phone test of 1 November 2026 (Davide, iPhone with Safari). Details and proposed fixes in `docs/FIX_BRIEF_2.md`

1. B13 No message appears in forms with a required field left empty, including sign up and login (iPhone Safari does not show the browser's own message). Status: Done (branch `claude/beautiful-johnson-vsdump`): one helper, `src/lib/formcheck.ts`, used by every form. The iPhone itself still has to be tried by Davide.
2. N1 Player things (the unanswered events banner, the count in the bell, answer buttons, the person's own certificate banner) must not appear in the staff views. The banner showed on Membri only because it is hidden on a few pages. Status: Done (branch `claude/beautiful-johnson-vsdump`), including the certificate line (decision 106).
3. N2 The unanswered window should be this week, not 14 days; the same number everywhere. Status: Done (branch `claude/beautiful-johnson-vsdump`): one helper, `src/lib/unanswered.ts`, tested around Sunday midnight and both clock changes.
4. N3 The notification panel runs off the left side of the screen on phones and must close when tapping outside it. Status: Done (branch `claude/beautiful-johnson-vsdump`): fixed under the top bar and centred on phones, closes on a tap outside, Escape and after a link, focus returns to the bell. The checker tries it at 320, 375, 430 and 1280. iPhone proof still to be done by Davide.
5. N4 In Documenti the date box is wider than the page on iPhone. Status: Done (branch `claude/beautiful-johnson-vsdump`): one rule for date and time fields (UI rule 2.10), and the checker now reports any field past the window edge at 320 to 1280 pixels. It found and fixed two overflows at 320 (member edit, absences). iPhone proof still to be done by Davide.
6. N5 In Profilo, Assenze, the start and end dates are too close together; check every form for the same problem. Status: Done (branch `claude/beautiful-johnson-vsdump`): the two dates stack on phones with the labels Dal and Al, side by side from 600 pixels. Audit of the other rows at 320: the two club colour swatches, the two jersey names, the days and the number of people of the team link, and the start and end times of an event stay as they are because each pair is short; nothing else puts two dates on a row. Rule 2.9.
7. N6 A certificate date can be saved without a certificate file. Status: Done (branch `claude/beautiful-johnson-vsdump`, migration 0036): a certificate needs a file; the date of issue is read from the photo or typed (PDF, or nothing found) and then staff confirm it; the end date is the date of issue plus one year; states missing, date missing, to verify, expired, soon, valid in the page, the banner, the Members column, the Home figures and the reminders.
8. N7 Use standard wording ("Notifiche") instead of "Email dal club", and check every text for the same kind of inconsistency. Status: Done (branch `claude/beautiful-johnson-vsdump`): glossary in `docs/UI_RULES.md` 3.9, texts changed in `it.json`, `en.json` and the four email texts. Changed texts are listed in `docs/PROGRESS.md`.
9. N8 The label "Per lo staff" on the Home page. Status: Done (branch `claude/beautiful-johnson-vsdump`): "Da gestire".
10. N9 The group selector looks different from the other controls in the phone top bar. Status: Done as Claude's choice (decision 110), waiting for Davide's look: pictures in `docs/ui-review/`.
11. N10 The hockey style of the event page is missing on the Home page: Davide means the red line with the centre circle of the Eventi page. Status: Done as Claude's choice (decision 111), waiting for Davide's look: pictures in `docs/ui-review/`.
12. N11 Club settings: the groups should be folded so that not everything is shown at once. Item 12 of the review of 31 October was marked done with headings only. Status: Done (branch `claude/beautiful-johnson-vsdump`): the three groups are folded rows with a one line summary, one open at a time, all closed on first load (decision 112); item 12 of 31 October is closed with it. The groups page was already a folded list; the ice, rink and invite pages have two groups of settings or fewer, so they stay as they are.
13. N12 The Campionato shows a game "Sgularat against Vikings" that is not of group A. Status: Parked (decision 104): Davide does not want to send a screenshot.
14. N13 "Tutte le partite" is not all the games (the lists show 10). Status: Done (branch `claude/beautiful-johnson-vsdump`): chips Tutte le squadre and Solo {squadra}, headings Prossime partite and Ultimi risultati, "10 di 24" and "Mostra altre 10".
15. N14 Championship statistics (top scorers, assists and so on), computed by the app from the game data. Status: Decided, a feature after a first check of what the game details contain.

## Review of 31 October 2026 (screenshots of events, members, attendance, settings, club, groups, profile, documents)

1. Home page. There is none; one would be useful and good looking. Status: Done (PR 37), built as proposed to Davide (next event with answers, pending answers, announcements, league position and last result, staff figures); waiting for his changes.
2. Group selector. The chips wrap onto two lines ("C2", "Start" below); it should be a control that opens the list. Status: Done (PR 37).
3. View by role. A control in the top bar to choose Direttivo, Allenatore or Giocatore view, so a board member can see the player view when the board view is not needed. Status: Done (PR 37).
4. Events page on computers: the links at the bottom (Eventi passati, Da contattare, Esercizi) and the empty space when scrolling. Davide asked why those three links and what they should be. Status: Done (PR 37). Eventi passati was the phone way to see past events and stays on phones only (the calendar list has Passati on computers); Da contattare is now the Senza risposta tab of Presenze; Esercizi is in the sidebar for staff.
5. Names: capital initials for consistency, and no digits allowed when people type their name. Status: Done (PR 37).
6. Members: empty space under Cerca; search and actions on one row. Colons after labels: the call is left to Claude (decision: no colons, rule 2.2). Status: Done (PR 37).
7. Campionato: open a past game to see its details (scorers, penalties) from the league website. Status: Done (PR 37).
8. Campionato: "Solo le nostre" is not a standard label. Status: Done (PR 37).
9. Presenze: the search field is taller than the selects, the table is not clear, coloured cells reduce readability (keep colour, fix readability), the intro text is not professional. Status: Done (PR 37).
10. Texts: "un mese prima" and "un mese dopo" should be more professional ("il mese precedente", "il mese successivo", or exact days). Status: Done (PR 37), but the attendance grid still said "Mese prima" and "Mese dopo"; finished in branch `claude/charming-ride-yo6gpc` (fix brief B1).
11. Impostazioni: the cards are not how settings are usually shown; use the standard convention. Status: Done (PR 37).
12. Impostazioni del club: empty space at the top, an underlined link to go back, content stuck to the left, no grouping (Nome e logo; Colori del club e delle maglie; Documenti), long scrolling. Status: Done (PR 37). Reopened on 1 November and closed again with N11.
13. Gruppi: same back link and alignment problems. Status: Done (PR 37).
14. Inviti: past invites should be grouped. Status: Done (PR 37).
15. Profilo: the photo appears twice; the content is centred while other pages are on the left; opening Documenti changes the layout and the section list disappears. Status: Done (PR 37).
16. Profile sub pages (Assenze, Email dal club, others): no way back on phones. Status: Done (PR 37).
17. Events: "Da rispondere (5)" stays 5 after answering because it shows the next five; the label is wrong. Status: Done (PR 37).
18. Keep track of everything and add a check that runs on every change. Status: Done in this branch (`docs/UI_RULES.md`, this file, `scripts/ui-check.mjs`).

## Test of 31 October 2026 (interface test in a browser, fix brief), all in branch `claude/charming-ride-yo6gpc`

1. A1 Cancelling an event asks first, in the confirmation window. Status: Done.
2. A2 Deleting an event uses the same window, with the choice for a series inside it. Status: Done.
3. A3 Deleting an announcement or a drill names it in the window. Status: Done.
4. A4 Tables wider than their card show a shadow and a hint (`TableScroll`); the attendance and members tables fit at 1280 pixels. Status: Done.
5. A5 After the event, Presenti means the people recorded as on time or late; the number appears once. Status: Done (needs migration 0035 for players).
6. A6 Scores in one order on every screen. Status: Done (decision 82).
7. B1 grid month buttons, B2 en dash for zero and empty values, B3 breadcrumb without the repeated name, B5 grey placeholders while loading, B6 44 pixel links, B7 the Da rispondere heading says what it counts, B8 surname first everywhere, B9 saved note and vote hint, B10 the day in the bell, B11 menu button on the first row, B12 the new event opens. Status: Done.
8. B4 Groups stay chips; rule 2.3 changed. Status: Decided (decision 83).
9. B13 The browser's own validation message for a missing date or time may be English on a phone. Status: Open, to be looked at on a real Italian phone before anything is replaced.
10. B14 The old test members with digits in their names. Status: Open, a data fix on the test project, not code.
11. C1 to C3 Dark mode: bell badge, result circles and today mark use dark text on the light signal colours; the training band is a deep blue with white text. Status: Done.

## Found during the long run (31 October 2026, Claude)

1. At 320 pixels the member page and the absence form were wider than the window. Status: Done (UI rule 2.10).
2. The yellow club banner on Eventi had pale text on yellow. Status: Done: the text follows the colour's brightness.
3. With the largest text size, the page size buttons of the attendance table and the facts of an event pushed the page sideways. Status: Done.
4. A bell line read "1 nuovi". Status: Done ("1 nuovo avviso").
5. Not done on purpose: the list rows and week cards have no "Apri in Mappe" button (decision 116); the unused texts of `it.json` (about 20 outside the error codes) are not removed.

## Follow up run, voted ideas (V1 to V10)

1. New screens: "Ultimi scontri con ..." on a game page, the number hint on Dati personali, "Documenti del club" in the profile list, the video button on a game, "In evidenza" announcements, "Traguardi" in La mia stagione, "Il tuo pronostico" and the list of guesses on a game, the Statistiche tabs "Pronostici" and "Albo d'oro", the shift timer on the line-up tab. Status: Done, checked by the interface checker (except the shift timer, see item 3).
2. The checker found a club document row whose button left the window at 320 to 390 pixels, and a video link under 44 pixels. Status: Done.
3. The shift timer only shows for staff during a live game; the checker's sample data has none, so it was looked at by hand only in a scratch run. Status: Open (add a live game to the sample data).
4. At 375 pixels the tab strips (Statistiche, event page, Presenze) were cut at the right edge with no sign that they scroll. Status: Done (polish round 6): a soft fade on the edge with more tabs (`TabStrip`), the active tab scrolled into view, "Albo d'oro" shortened to "Albo", and a check in `scripts/ui-check.mjs`.
5. In the profile list the dot of the "Documenti" status touches the last letter of the word in the checker's screenshot at 1280 pixels. Status: Open, check on a real screen.

## Earlier reviews

1. The banner says "Hai 1 evento senza risposta" while the events panel lists five: different time spans. Status: Done (PR 37).
2. The Campionato page has its own group chips without Tutti, separate from the global selector. Status: Done (PR 37).
3. New event form: date, times and meetup stacked in one narrow column; the global group is not preselected everywhere. Status: Done (branch `claude/charming-ride-yo6gpc`): day and times side by side, and the chosen group is preselected in the event, announcement and invite forms.
4. Event page: the event strip does not follow the chosen group. Status: Done (branch `claude/charming-ride-yo6gpc`).
5. League names are stored with a simpler capitalisation than the app shows. Status: Open.
6. A real PDF certificate upload has not been confirmed. Status: Open (Davide to try).
7. Destructive actions without confirmation (revoke invite, remove logo, remove certificate file, withdraw consent, remove photo), found by the UX audit of 31 October. Status: Done (PR 37).
