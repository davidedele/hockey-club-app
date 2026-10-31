# UI rules

Every change to what a member sees follows these rules. They come from Davide's reviews (see `docs/UI_BACKLOG.md` for each point and its status) and from the conventions most apps and websites share, with SportEasy as the reference for this club (`docs/sporteasy/README.md`).

Read this file, and the open items of `docs/UI_BACKLOG.md`, before touching a page. Run the checklist at the end before handing the work over. When Davide gives a new rule about the interface, add it here and add the point to the backlog in the same change.

## 1. Page frame

1. Every signed in page sits in the same frame: `.page`, at most 80rem wide (the wide viewport token, 1280 pixels), centred in the space beside the sidebar. The left edge of the content is therefore the same on every page at a given window width. No page is pushed to the left while another is centred.
2. Forms and reading text inside a page are limited to a readable column (`.form-col`, 40rem) that starts at the left edge of the frame. Tables, calendars and boards use the full frame.
3. A page starts with its page header (`PageHeader`): the title, an optional one line description, and the page actions on the right. The header always sits at the same distance from the top bar. No empty band above it.
4. A sub page shows how to go back. On phones the page header carries a back button (a chevron and the name of the parent page) at the top left. On computers the section list of the shell (rule 5) or the breadcrumb in the top bar does this job, so no underlined "back" link is shown in the content.
5. A section with sub pages is a shell: a card with the section list on the left and the content on the right, as in SportEasy's team settings. Settings and the profile both use it. The list stays on screen on every sub page of the section, including Documenti in the profile. On phones the list is the section's first page and every sub page has the back button of rule 4.
6. A picture or a piece of information appears once per screen. For example the profile photo is in the shell card, not repeated in the content.
7. No row of loose links at the bottom of a page. An action belongs to the page or panel it concerns, or to the navigation.
8. A wait longer than a second shows a skeleton of what is coming, not a line of text or a spinner; a loading number shows an en dash.

## 2. Controls

1. Text fields, selects, buttons and chips are 44 pixels tall. A select looks like a text field (same border, radius, padding and font), never like the small native control.
2. Labels sit above the field, in sentence case, without a colon. A label inline with a toolbar field (for example "Cerca") also has no colon.
3. A choice among more than four options is a button that opens a list. Chips are for two to four fixed filters. One exception, decided by Davide on 31 October 2026: the club's groups (A, B, C1, C2, Start) are shown as chips wherever a person chooses one or several of them (event form, announcement form, invites, group filters), because there are only about five and chips are quicker to tap. The group selector of the shell stays a menu (rule 5.1).
4. A search field and the actions of the same list share one toolbar row: search on the left, actions on the right. They wrap only when the window is too narrow.
5. Destructive actions, and actions that tell other people (cancelling an event), ask for confirmation naming the thing, in the same window (`ConfirmDialog` in `src/components/ConfirmAction.tsx`): Annulla has the focus, Escape closes it and does nothing, no choice is inline in the page. Print and export open a window first.
6. A menu (for example the event actions) closes as soon as one of its actions is chosen.
7. Removing something (an invite, a logo, a file, a photo, a consent) goes through `ConfirmAction`: the window names the thing, the action is red and Annulla has the focus.
8. Form errors are written by the app, not by the browser. Every form is built with `checked(handler)` from `src/lib/formcheck.ts`: the browser check is turned off (`noValidate`), the app checks required fields and the `minLength`, `maxLength`, email and number range rules when the button is pressed, writes an Italian message under each field with a problem, sets `aria-invalid` and `aria-describedby` on it and moves the focus to the first one. The message disappears as soon as the field is edited. A submit button is never disabled just because a field is empty, because then no message can show. The browser's own bubbles are not used, because iPhone Safari blocks the submit without showing them. `scripts/ui-check.mjs` submits every form empty and expects the message.
9. Two fields share a row at phone width only when both are short (two times, two small numbers, two colour swatches, two short names), and never two date fields: they stack one under the other, each with its own label ("Dal", "Al"), and sit side by side from 600 pixels. At 320 pixels every field must still fit; the checker reports a field that reaches past the window edge.
10. Date and time fields (`input[type=date]`, `time`) follow one rule in `src/styles.css`: `min-width: 0; max-width: 100%; appearance: none` and a left aligned, shrinkable `::-webkit-date-and-time-value`, because iPhone Safari gives them a width of their own that ignores `width: 100%`. Their parents (labels, grid cells) may shrink (`min-width: 0`).
11. On phones the tab bar has at most five places. Pages that do not fit (the drill library) are in the computer sidebar and reachable from where they are used.

## 3. Text

1. Every visible text is in `src/i18n/it.json` and `src/i18n/en.json`, with the same keys.
2. The tone is professional and courteous, like a well made app, not a chat. Avoid colloquial turns such as "Si cambia con il menu in alto"; write "Puoi cambiare gruppo dal selettore in alto." Prefer precise terms: "il mese precedente", "30 giorni prima della scadenza", not "un mese prima" when a date is meant.
3. A heading with a number says exactly what is counted, and the same quantity shows the same number everywhere (banner, bell, panels). If a list shows only part of a set, the heading says so ("Prossimi 5 senza risposta") or shows the full count with a link to the rest.
4. Singular and plural are both written out ("1 membro", "2 membri").
5. People's names are shown with capital initials and never contain digits. The database tidies names on save and refuses digits; the forms say so before saving.
6. Filter and toggle labels use standard words ("Tutte le partite", "Solo Sgularat"), not invented ones.
7. A person's name is written surname first, "Rossi Marco", in lists, headings, messages and the sidebar, through `personName` in `src/lib/names.ts`. A greeting uses the first name only. The same person never reads two ways on one screen.
8. Scores: where both team names are shown, the home side comes first, in the names and in the score. Where only our result is shown, our score comes first and the text says so ("Noi 4, avversari 2", "In ogni partita il nostro punteggio è scritto per primo.").

9. Words for what the app sends (decision 100). "Notifiche" is the general word, for what reaches a person by push or by email. The bell panel is "Notifiche". The profile page where the person chooses what they receive is "Preferenze di notifica". "Avvisi" is only the announcements that staff write. "Email" appears only where the channel is the point ("Ricevi le notifiche per email", the confirmation email at sign up). "Promemoria" is only the reminder about an event that has no answer. "Novità" is not used. The same words are used in the server function texts (`supabase/functions/send-reminders`). The card on Home for staff is "Da gestire".

## 4. Tables and data

1. A table sits in a white card with a 1 pixel border and hairline row dividers.
2. Header text has at least 4.5:1 contrast on its background. Coloured column groups use a pale tint for the header and a paler one for the body, never a tint that lowers the contrast of the numbers below 4.5:1. Group headers are separated from the column headers by a line, and totals are bold.
3. Numbers are right aligned with tabular figures; an empty or zero value is an en dash.
4. A loading number shows an en dash, never a 0 that changes later.
5. A table wider than its card sits in `TableScroll` (`src/components/TableScroll.tsx`): a shadow on the right edge and the line "Scorri la tabella di lato per vedere tutte le colonne." under it appear whenever it scrolls, so no column is hidden without a sign. Tables are narrowed first (padding, wrapping headers, one email per line) so that they fit at 1280 pixels when they can.

## 5. Selection of the group and the role

1. One group selector for the whole app, at the top of the sidebar (in the phone header on phones). Every page that can be narrowed to a group follows it; no page has its own separate group chips.
2. People with more than one role (Direttivo, Allenatore, Giocatore) can choose the view in the top bar. The view only hides; it never grants anything, and the database rules stay the same whatever is chosen.
3. Player things belong to the Giocatore view only (decisions 93 and 106): the unanswered events banner, the answer buttons and the "La tua risposta" box, the list of events to answer on Home and Eventi, the pending count in the bell, and the person's own certificate and privacy line. The Direttivo and Allenatore views never show them. The bell keeps announcements and discussion messages in every view. A person who is also a player switches to the Giocatore view to get the reminders. `scripts/ui-check.mjs` checks it.
4. "Events without an answer" always means the calendar week in Italian time, from now until the next Monday 00:00 (decision 92), computed by `weekEnd` and `unanswered` in `src/lib/unanswered.ts`. The banner, the bell, the Home tile and the Eventi heading use that one function, say "questa settimana", and show the same number. Later events wait under a collapsed "Più avanti".

4. The controls of the phone top bar (group, view, bell, gear, picture) are one family: round, 44 pixels, flat, the same focus ring. The group selector shows the code of the chosen group (A, B, C1, C2, S) in a 36 pixel circle like the profile picture, or an icon for all groups; the list that opens shows the full names.
5. The red "now" line with the small circle in the middle, like the centre line and circle of a rink (`.nowline`), is the club's hockey mark. It is used at most twice on a screen: above the next event ("Adesso") and as the divider before what comes later ("Più avanti"). Red stays otherwise for danger and errors.

## 6. How to check

1. Run `node scripts/ui-check.mjs`. It builds its own copy of the app against a fake backend with invented sample data (no account, no network), opens every page at 375 and 1280 pixels, saves screenshots to `ui-check/`, and fails on: sideways scrolling, controls under 44 pixels, a select with the native look, a page frame whose left edge differs from the others, a sub page without a way back, a translation key shown as text, a label ending with a colon, a script error. It also tries the group menu and the view menu by keyboard, the name rule on leaving the field, and a confirmation window (Annulla focused, Escape removes nothing). A new page goes into its route list; a new kind of data goes into `scripts/ui-check/fixtures.mjs`.
2. Look at every screenshot of a page you changed, top to bottom, at both widths. A passing script is not a passing page.
3. What the checker cannot measure, so a person has to look: the wording and tone of texts, singular and plural, whether a heading number is the full count, a number that is wrong (the sample data is invented), the dark theme (no contrast is measured and the checker runs in light only), grey placeholders while loading (the fake backend answers at once), whether a table that scrolls inside its card hides a column, the alignment and dash rules of tables, whether the same thing appears twice on a screen, chips against menus, confirmation windows other than revoking an invite, anything that needs the real database or a real mouse drag, and the browser's own validation messages. Its tests of the checker itself are: break one page for each rule it measures in a scratch copy and see it reported (done on 31 October 2026, see `docs/PROGRESS.md`).
4. Run the UX skills that apply (`vectorlab-ux-skills:ux-audit`, `ui-consistency:verifying`, `ux-ui-audit:ux-ui-audit` on the live site when it is published) and write what could not be proven.

## 7. Checklist before handing over

1. The page uses `.page` and `PageHeader`; the content starts at the same left edge as the other pages.
2. Sub pages have a way back; shells keep their section list.
3. Controls are 44 pixels and selects look like fields; labels have no colons.
4. Toolbars put search and actions on one row.
5. Every number in a heading is the full count of what it names.
6. Texts are in both translation files, in a professional tone, singular and plural handled.
7. Tables follow section 4.
8. Nothing appears twice on the same screen; no row of loose links.
9. `npx tsc -b`, `npm test`, `npm run test:db` (when the database changed), `npm run build` and `node scripts/ui-check.mjs` pass.
10. Screenshots at 375 and 1280 looked at, and the backlog updated with what was done and what is still open.
