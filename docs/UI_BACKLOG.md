# UI backlog

Every point Davide raised about the interface, with its status. Newest review first. When a point is done, write the pull request next to it; when it turns into a general rule, the rule goes in `docs/UI_RULES.md`.

Status words: Open, In progress, Done (PR number), Decided (waiting for Davide), Won't do (with the reason).

## Review of 31 October 2026 (screenshots of events, members, attendance, settings, club, groups, profile, documents)

1. Home page. There is none; one would be useful and good looking. Status: Done (branch claude/design-consistency), built as proposed to Davide (next event with answers, pending answers, announcements, league position and last result, staff figures); waiting for his changes.
2. Group selector. The chips wrap onto two lines ("C2", "Start" below); it should be a control that opens the list. Status: Done (branch claude/design-consistency).
3. View by role. A control in the top bar to choose Direttivo, Allenatore or Giocatore view, so a board member can see the player view when the board view is not needed. Status: Done (branch claude/design-consistency).
4. Events page on computers: the links at the bottom (Eventi passati, Da contattare, Esercizi) and the empty space when scrolling. Davide asked why those three links and what they should be. Status: Done (branch claude/design-consistency). Eventi passati was the phone way to see past events and stays on phones only (the calendar list has Passati on computers); Da contattare is now the Senza risposta tab of Presenze; Esercizi is in the sidebar for staff.
5. Names: capital initials for consistency, and no digits allowed when people type their name. Status: Done (branch claude/design-consistency).
6. Members: empty space under Cerca; search and actions on one row. Colons after labels: the call is left to Claude (decision: no colons, rule 2.2). Status: Done (branch claude/design-consistency).
7. Campionato: open a past game to see its details (scorers, penalties) from the league website. Status: Done (branch claude/design-consistency).
8. Campionato: "Solo le nostre" is not a standard label. Status: Done (branch claude/design-consistency).
9. Presenze: the search field is taller than the selects, the table is not clear, coloured cells reduce readability (keep colour, fix readability), the intro text is not professional. Status: Done (branch claude/design-consistency).
10. Texts: "un mese prima" and "un mese dopo" should be more professional ("il mese precedente", "il mese successivo", or exact days). Status: Done (branch claude/design-consistency).
11. Impostazioni: the cards are not how settings are usually shown; use the standard convention. Status: Done (branch claude/design-consistency).
12. Impostazioni del club: empty space at the top, an underlined link to go back, content stuck to the left, no grouping (Nome e logo; Colori del club e delle maglie; Documenti), long scrolling. Status: Done (branch claude/design-consistency).
13. Gruppi: same back link and alignment problems. Status: Done (branch claude/design-consistency).
14. Inviti: past invites should be grouped. Status: Done (branch claude/design-consistency).
15. Profilo: the photo appears twice; the content is centred while other pages are on the left; opening Documenti changes the layout and the section list disappears. Status: Done (branch claude/design-consistency).
16. Profile sub pages (Assenze, Email dal club, others): no way back on phones. Status: Done (branch claude/design-consistency).
17. Events: "Da rispondere (5)" stays 5 after answering because it shows the next five; the label is wrong. Status: Done (branch claude/design-consistency).
18. Keep track of everything and add a check that runs on every change. Status: Done in this branch (`docs/UI_RULES.md`, this file, `scripts/ui-check.mjs`).

## Earlier reviews

1. The banner says "Hai 1 evento senza risposta" while the events panel lists five: different time spans. Status: Done (branch claude/design-consistency).
2. The Campionato page has its own group chips without Tutti, separate from the global selector. Status: Done (branch claude/design-consistency).
3. New event form: date, times and meetup stacked in one narrow column; the global group is not preselected everywhere. Status: Open.
4. Event page: the event strip does not follow the chosen group. Status: Open.
5. League names are stored with a simpler capitalisation than the app shows. Status: Open.
6. A real PDF certificate upload has not been confirmed. Status: Open (Davide to try).
7. Destructive actions without confirmation (revoke invite, remove logo, remove certificate file, withdraw consent, remove photo), found by the UX audit of 31 October. Status: Done (branch claude/design-consistency).
