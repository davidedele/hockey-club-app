# SportEasy website: what the A Team site looks like

Observed on 30 October 2026 from a coach account on the A Team site, read only. Nothing was changed in SportEasy. This file describes the desktop website, page by page, as a reference for the computer layout of our app.

The screenshots in this folder show pages with no member data. Pages that show member names, photos or contacts (members list, attendance tables, the attendance board and the line-up on an event) are not stored in the repository, because the repository is public. They are described below in words only.

Screenshots in this folder:
1. `calendar-month.jpg`, `calendar-list.jpg`
2. `event-header-and-tabs.jpg`
3. `championship-results.jpg`, `championship-standings.jpg`, `championship-player-stats-empty.jpg`, `championship-settings.jpg`
4. `statistics-team.jpg`
5. `attendance-tasks-empty.jpg`
6. `messages.jpg`, `payments.jpg`, `team-settings.jpg`

## 1. The shell (every page)

1. **Sidebar.** A dark olive column on the left, about 120 pixels wide in the screenshots, full height with rounded outer corners. At the top: the SportEasy logo and a button that collapses the sidebar. Below it a team switcher (team name in bold, club name under it, a chevron). Then eight items with an icon and a label: Calendario, Campionati, Membri, Presenza, Statistiche, Messaggi, Pagamenti, Impostazioni. The active item has a slightly lighter rounded background. The last item is the signed in person's own name with a round photo.
2. **Top bar.** A slim white bar. On the left a home icon and a breadcrumb: club, team, current page (for an event it ends with the event title, cut short). On the right two icons with red dots (notifications and a shirt icon, probably team requests or news) and the person's name with a round photo.
3. **Page canvas.** A very light grey. Content sits on white cards with rounded corners and a hairline border, no heavy shadows.
4. **Content width.** Content is a single centred column of roughly 770 pixels, with wide empty margins on both sides, whatever the screen width. Tables and charts fill that column and never use the full width. (The browser window may have been zoomed out, so the exact pixel width is approximate; the column is clearly narrow compared with the screen.)
5. **Page title.** Every page starts with its title in the yellow accent colour, left aligned at the top of the column, in a medium weight.
6. **Accent colour.** Yellow for primary buttons ("Crea un evento", "Aggiungi un membro", "Salva"), active tabs (a yellow underline) and the page titles. Green and red for status (present, absent). Small grey outline icon buttons for print, export and settings.
7. **Help.** A round green help button sits at the bottom right of every page. Small yellow "tour" pop ups with a short title, a sentence and a "Capito" style button appear the first time some pages are opened.

## 2. Calendario

Screenshots: `calendar-month.jpg`, `calendar-list.jpg`.

1. Title "Calendario", then a season selector (for example "2026-2027 (Attuale)") under it. At the right of that row: two small icon buttons (calendar sync and print) and a yellow "Crea un evento" button.
2. **Left filter panel** (a narrow white card): a "Filtri" heading and a group "Eventi" with a checkbox list. The first checkbox is "Tutti i tipi", then one checkbox per event type (here "Partita amichevole" and "Libertas A", the championship), each with a coloured square and a count at the right.
3. **Main card.** The month name ("Ottobre 2026") as a heading, a view selector ("Vista mese"), previous and next arrows, an "Oggi" button and an "Impostazioni" button. Under that a search box on the left and a two button toggle on the right: grid view and list view.
4. **Grid view.** A month grid, Monday first, with the weekday names across the top and the day numbers in the top right of each cell. Days outside the month are greyed. Today is a yellow filled circle. Events are thin coloured bars inside the day cell (blue for the friendly game, red for the championship game) with a small icon and the title cut short. Cells are tall and mostly empty.
5. **List view.** A table with a select all checkbox and these columns: Data (date and time), Tipo (an icon), Num. (round number), Presenza (the person's own answer: "Presente" in green, "Assente" in red), Evento (home team, score or a dash, away team) and Azioni (a three dot menu). Past events are shown greyed. A finished game shows its score in a small pill.

## 3. Pagina dell'evento

Screenshots: `event-header-and-tabs.jpg` (the rest contains member data and is described only in words).

1. **Event strip at the top.** A row with a previous arrow, four event cards and a next arrow. Each card shows the day and month in a small block at the left and the two team names stacked, with the score at the right for finished games. The current event is highlighted in yellow. Empty slots say "Nessun evento previsto". It works as a quick way to move between neighbouring events.
2. **Header band.** A full width band in the event type colour (yellow here) with the date centred ("31 ottobre 2026") and, under it, the competition and round with the meetup time ("Libertas A, Giornata 1, Appuntamento 16:30"). A white three dot button at the right opens the event menu (edit, delete and similar).
3. **Match block.** Under the band, on white: the two team names large on each side, and in the middle a grey box with the start time in large type and the end time under it. Under that the venue in yellow.
4. **Tabs.** A white bar with five tabs centred: Informazioni, Presenza, Compiti, Formazione, Forum. The active tab has a yellow underline.
5. **Informazioni tab, layout.** A three column grid of cards:
   1. Left column, narrow: "Il mio stato di partecipazione" with the person's photo, a red "Assente" button (the current answer) and a yellow link "Sarò presente" to change it. Under it a "Presenza" card with four big counters (Presenti in green, In attesa in grey, Non convocati and Assenti in red), a link "Gestisci le presenze", and collapsible lists of people for each status (a coloured header row with the status and the count, then rows with a round photo and the name).
   2. Middle column: "Messaggio dall'allenatore" (an empty state with a megaphone icon and a yellow button "Invia un messaggio ai partecipanti"), then "Forum" (an empty state with a speech bubble icon, "Sii il primo a postare un messaggio!", and a message box at the bottom with attach, emoji and poll icons, a yellow "Invia" button and a three dot menu).
   3. Right column: "Compiti" (an empty state explaining tasks such as washing the shirts, with a yellow "Assegna compiti" button).
   4. Below the grid, full width of the middle and right columns: "Formazione", with a "Privata" label, a grid or list toggle, and a picture of the rink seen in perspective with a yellow "Crea la formazione" button over it.
6. **Presenza tab.** A title "Presenza", two small icon buttons and a yellow "Modifica i partecipanti" button. Under it four columns side by side, each with a coloured header (green "Presenti (14)", yellow "In attesa (2)", orange "Non convocati (4)", red "Assenti (4)") and a list of players, each row with a drag handle, a round photo, the name and a three dot menu. The coach can drag a player from one column to another.
7. **Formazione tab.** A title, a bar with a text field "Nome della formazione", a yellow "Salva la formazione" button and a delete button. Below: the rink drawing on the left and a "Lista dei giocatori" with photos on the right. Players are placed on the rink.
8. **Compiti and Forum tabs.** Empty states in a single card. Forum is a message thread for the event.

## 4. Campionati

Screenshots: `championship-results.jpg`, `championship-standings.jpg`, `championship-player-stats-empty.jpg`, `championship-settings.jpg`.

1. Title "Campionati", a season selector and a championship selector side by side, a print button and a yellow "Crea campionato" button at the right.
2. Tabs in a white bar: Calendario/Risultati, Classifica, Statistiche della squadra, Statistiche dei giocatori, Impostazioni.
3. **Calendario/Risultati.** A card with the heading and a yellow "Aggiungi partite" button. Inside, a round selector with previous and next arrows ("Giornata 1"), then a grey row for the round with a pencil button, and one row per game: home team, a dash or the score, away team, date, time.
4. **Classifica.** A card with the championship crest and name, the season, and a standings table: position, team, Punti, G, V, N, P, R, GF, GS, DR, Media punti, MVP, with sortable headers. The row of our team is highlighted in pale yellow.
5. **Statistiche dei giocatori.** A card with a "Filtra per" selector and, while there is no data, an empty state with a laurel icon and an explanation that the coach has to enter statistics for each event.
6. **Impostazioni.** A second row of pill shaped sub tabs (Informazioni generali, Squadre partecipanti, Classifica, Punti, Note e voti, Convocazioni, Elimina in red) and a plain form card: name, format ("6 contro 6"), registered venue, a yellow "Salva" button.

## 5. Membri

Not stored as a screenshot (it shows member names, photos and contact addresses).

1. Title "Membri" with four small icon buttons (edit, columns, export, info) and a yellow "Aggiungi un membro" button at the right.
2. One white card with a heading "24 membri" and an "Impostazioni" button.
3. A toolbar: a search box at the left; at the right dropdown buttons "Mostra", "Fissare", "Filtri" and "Ordina", and a toggle between card view and list view.
4. The table: a select all checkbox, a row number, a round photo (initials on a pale yellow circle when there is none), a small icon column for parents, surname, name (both sortable), nickname, then parent contact columns, and a three dot "Azioni" column pinned at the right. Rows are thin with hairline separators.
5. A footer with a page size choice (20, 50, 100), the text "Elementi per pagina" and numbered pagination with arrows.

## 6. Presenza

Screenshot: `attendance-tasks-empty.jpg` (the other two tabs show member names).

1. Title "Presenza", a season selector and an event type selector ("Tutti gli eventi"), and print and export icon buttons at the right.
2. Tabs: Sintesi, Per eventi, Assegnazione di compiti.
3. **Sintesi.** A card with the number of events, a search box and a role filter ("Tutti i ruoli"). One wide table: a row per player (number, photo, name) and column groups with coloured headers: "Convocazioni" (total times called), "Presenze" in green (Puntuale, Ritardo, Totale), "Assenze" in red (Lista d'attesa, Giustificato, Non giustificato, Totale) and "Altre" in yellow (Infortunato, Non convocato). Each header has a small status icon above its label. Zero values are shown as dashes and totals are bold. A thin line separates every few rows.
4. **Per eventi.** The same player rows with one column per event (a date at the top) and a coloured status icon in each cell: green tick for present, yellow for waiting or excused, red cross for absent, grey slashed circle for not called up. Next to the search box a small button chooses the period.
5. **Assegnazione di compiti.** A search box, a role filter and a grey empty state saying no tasks have been assigned yet.

## 7. Statistiche

Screenshot: `statistics-team.jpg`.

1. Title, a season selector, a selector of games ("Tutte le partite") and a print button. Tabs: Classifica, Statistiche della squadra, Statistiche dei giocatori.
2. **Statistiche della squadra** is a dashboard of white cards in a grid:
   1. "Risultato": the number of games played as a big number, and three circular gauges (vittorie, pareggi, sconfitte); the one with a value is a thick red ring.
   2. "Gol realizzati": a donut chart in red and green with the goals scored (green) and conceded (red) under it.
   3. "Numero di partite per differenza risultato": a wide bar chart, one bar per goal difference.
   4. "Punteggio medio": two bars, average goals scored (green) and conceded (red), with a legend.
   5. "Ultima partita": a row of round letters (V, P, S) for the most recent results.
   6. Two cards side by side, "Migliori serie" and "Peggiori serie", each with horizontal progress bars and a date.
3. **Classifica** needs a championship picked in a selector. **Statistiche dei giocatori** is a table per player.

## 8. Messaggi

Screenshot: `messages.jpg`.

A two pane page. Left, a narrow list of conversations under the title "Messaggi" with a small yellow compose button; a pale yellow row "Nuovo messaggio" is selected. Right, a large white card: a recipient field at the top ("Aggiungi destinatari"), a subject line under it, an empty area for messages, and at the bottom a message box with attach, emoji and poll icons and a yellow "Invia" button.

## 9. Pagamenti

Screenshot: `payments.jpg`.

An empty promotional page: a card with an icon, a headline "Riceva i suoi primi pagamenti", a short paragraph, a yellow "Crea un pagamento" button and a short list of benefits, next to a large pastel illustration with four labelled tiles (Iscrizione, Attività, Pre-ordine, Cassa). The club does not use it.

## 10. Impostazioni squadra

Screenshot: `team-settings.jpg`.

Title "Impostazioni squadra". Two cards. Left, a narrow card with the team picture and name and a vertical list of sections (the first, "Modifica le impostazioni", is highlighted in pale yellow; others cover venues, tasks and similar). Right, the content of the section; for a coach account it only says the settings can be changed by a club administrator and shows a yellow "Modifica le squadre" button. A yellow tour pop up explains registered venues.

## 11. Patterns worth taking

1. A narrow centred column for forms and settings, wide use of the column for tables and boards.
2. Every list page has the same toolbar: search at the left, filters, sorting and view toggle at the right.
3. Tabs inside a white bar under the page title, with a yellow underline on the active one.
4. The event page is a hub: a strip to jump between events, a coloured header, then tabs for information, attendance, tasks, line-up and discussion.
5. Attendance is shown as four coloured status columns that the coach can drag between.
6. Attendance reports use grouped, colour coded column headers with totals.
7. Statistics use cards with one number or one chart each.
8. Empty states carry an icon, one sentence and one yellow action button.

## 12. What this site has that our app does not (and the reverse)

1. In SportEasy and not in our app yet: month grid and list calendar with a type filter panel, event strip and tabs on the event page, drag between attendance columns, per event attendance matrix, sortable and filterable members table with paging and export, team statistics dashboard, event discussion, a two pane message page, a team switcher, a top bar with a breadcrumb and notifications.
2. In our app and not in SportEasy: line-ups per training, training plans and the drill library, absence periods, medical certificate tracking, ice hours, announcements per group.
3. Not wanted by the club: payments, tasks, championship administration.
