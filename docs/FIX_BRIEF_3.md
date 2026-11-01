# Fix brief 3: Davide's desktop test of 1 November 2026 (evening)

This brief comes after `docs/FIX_BRIEF_2.md` and after the polish round of ten small items (`docs/PROGRESS.md`, "QA round 5", item 11). The checkpoint `checkpoint-1` is the state before this brief. Every point below was raised by Davide on a computer, in the board view and in the player view, against the test project. Each was checked against the code on `main` at commit 6d9aa18.

Nothing in this brief has been fixed yet. The decisions below were given by Davide on 1 November 2026 in his own words. They are written here, and not yet in `docs/DECISIONS.md`, because another branch was editing that file at the same time. The next session adds them as decisions, in this order, right after the highest number on `main`.

## How to use this brief

1. One session, one new branch from an up to date `main`, small commits, each with its proof. Follow `AGENTS.md`: read `docs/UI_RULES.md` and `docs/UI_BACKLOG.md` first and add every remark and rule in the same change.
2. Only one agent writes migrations. Check the highest number on `main` first. Each migration has its tests, its apply file in `supabase/apply` with the same guard as the others, and its entry in `scripts/test-apply.sh`.
3. Run the type check, unit tests, build, database tests, `scripts/test-apply.sh` and `node scripts/ui-check.mjs` (also with `UI_CHECK_DARK=1` and `UI_CHECK_LARGE=1`). Look at the screenshots at 375 and 1280 pixels for every changed screen.
4. Items marked "iPhone proof" need Davide on a real phone.

## Order of work

1. D3 (two step sign in optional): it blocks Davide and the board now.
2. D1 and D2 (certificate review queue, overlap in the profile menu).
3. D4 (the player view shows only the person's own groups).
4. D6 (settings for what members must provide): design first, in two phases.
5. D5 is a data check for Davide, not code.

## D1. There is no way of verifying a certificate

Davide: "there is no way for verifying the certificate."

Found:
1. The confirm button exists, but only in one place: `src/pages/Documents.tsx` lines 113 to 115 and 222 to 223 show "Conferma la data" when staff open **another member's** documents page (`/members/:id/documents`, `!own && isStaff`). On the person's own page there is only "Salva la data". So a board member looking at their own certificate, or looking for a place to review certificates, finds nothing.
2. Nothing lists the certificates that wait for review. The Home card "Da gestire" shows a count ("Certificati da verificare, 1 persona") and the Members table shows a status, but there is no single screen that lists the people waiting, lets staff open the file and confirm the date.

Change:
1. A staff screen "Certificati da verificare" (a tab of the Members page or a page under the settings, as the UI rules say for similar lists): one row per member whose certificate has a file and has not been confirmed, with the name, the date of issue as entered or read, a button to open the file, and one action "Conferma la data" with the date field to correct it. After confirming, the row disappears and the count on Home follows.
2. The Home figure "Certificati da verificare" and the Members column link to that screen.
3. Decision (Davide to confirm, my default first): staff cannot confirm their own certificate, because a second pair of eyes is the point of the check. In a club with one board member another coach or board member confirms it. The database function `verify_certificate` refuses `p_user = auth.uid()` with its own message, and the screen explains it in Italian. If Davide prefers to allow it, record `verified_by` as the person themselves and say so on the screen.

Proof: with a test member that has a file and a typed date, the board sees the row in the list, opens the file, confirms or corrects the date, and the status becomes valid; the row, the Home count and the Members column all change; own certificate refused. Database tests for the self case and for a coach.

## D2. Overlap in "Dati personali"

Davide: "if I go in dati personali, the text 'certificato da verificare' overlaps with 'documenti'."

Found: the profile menu rows (`src/pages/Profile.tsx` lines 53 to 55) show a label and, for Documenti, a status line (`doc-status`, `src/styles.css` lines 499 to 507 and the rule for `.shell-nav .sx .doc-status` at line 978). The status texts became longer in the certificate rule of migration 0036 ("Certificato da verificare"). On a computer, in the profile side menu, the label and the status share one line without room, so they overlap.

Change: let the row wrap, with the label first and the status under it, or cut the status with an ellipsis and give the full text as a title; no text may overlap at any width. Check every status text (all certificate and consent states) in the profile menu and in the Members table at 320 to 1280 pixels, with the larger text. Add the case to `scripts/ui-check.mjs` (a check that no two text boxes in a row overlap, if it can be measured; otherwise a screenshot rule in `docs/UI_RULES.md`).

## D3. Two step sign in must be optional

Davide: "I already activated the 2 way verification with the authenticator app but it still says that I have not. I think this should be optional, I don't want to force the people to have an auth app."

Decision (Davide): the two step sign in is optional for everybody, the board included. Nobody is forced. The club is not obliged to require it. This replaces decision 98's "required for the board after a grace period".

Found:
1. Today the rule is forced: migration 0041 added `club_settings.mfa_required_from` with a default of 30 days after the migration. After that date a board account without the second step is treated as a plain member (`mfa_ok()` in the database). The page "Sicurezza" says "Per il direttivo è obbligatoria" (`mfa.whatFor`), and for the board it shows a deadline notice or an invitation (`mfa.boardDeadline`, `mfa.boardNoDate`) whenever no verified app is found (`src/pages/Security.tsx` lines 66 to 72).
2. The "I have not" message appears when the page finds no verified authenticator app (`const on = factors.length > 0`, with `supabase.auth.mfa.listFactors()` in `src/lib/mfa.ts`). Davide says he enrolled. The cause is not known yet: either the setup was never finished (the code was not confirmed), or the page reads the wrong account (for example another browser session), or the list does not refresh after enrolling. A read only check shows which accounts have a verified factor: `select user_id, factor_type, status from auth.mfa_factors;` (a factor with the status `verified` counts, an `unverified` one means the setup was never finished).

Change:
1. A migration: set the default of `club_settings.mfa_required_from` to null and set the existing value to null, so nothing is required. `mfa_ok()` already treats null as "nothing required", so board powers never depend on the second step. Keep the function and the column: the board may switch the requirement on later from the club settings, with a clear text that says what will happen and warns about lockout. Add a test: with a null date a board account with a plain session keeps every board right.
2. Make "Sicurezza" an optional page: a title and one short explanation ("Facoltativa. Aggiunge un codice dell'app di autenticazione alla password."), no "obbligatoria", no deadline, no board warning. If the club has set a date, show the deadline notice only then.
3. Find out why "non è attiva" shows after enrolling and fix it: reproduce with a fresh account against the test project (an authenticator app can be simulated in a test with a TOTP library), check the list after the confirmation, after a reload and after signing out and in, and make the page show the real state. Add a test or a note of how it was checked.
4. Interim, until the migration is applied: Davide can run `update public.club_settings set mfa_required_from = null;` in the SQL Editor of the test project. It removes the requirement at once.

Proof: with no date set, a board account without the second step can do every board action; with a date in the past and no second step, board actions are refused (the old tests remain for the optional switch); "Sicurezza" shows the true state after enrolling and after a reload; the texts say optional.

## D4. In the player view a person sees only their own groups

Davide: "as a player, I'm in Serie A but I still see the games of the C category because I can still select 'tutti i gruppi'. When I'm in the player view I should be able to just view the things I'm supposed to."

Decision (Davide): in the Giocatore view, everything is limited to the groups the person belongs to. The group selector lists only those groups, and "Tutti i gruppi" means all of the person's own groups, not all groups of the club.

Found:
1. `src/lib/groupfilter.tsx` loads every group of the club (`from('groups').select('*')`), and the selector (`src/components/GroupSwitch.tsx`) shows all of them, for every view and also for a real player. A player can pick a group they do not belong to and see its statistics and its Campionato page, which the rules (club wide results, decision 26 and the earlier spec) allowed.
2. The view switch only changes what is shown (`src/lib/session.tsx` lines 73 to 99: `shown` roles). The database still answers by the person's real roles, so a board member in the Giocatore view still receives the events of every group, and "Tutti i gruppi" shows them all. A real player already receives only the events of their groups from the database, but the selector and the other pages still offer the other groups.

Change:
1. One helper, `useScopeGroups()`: in the Giocatore view (the chosen view, or a person with no staff role) it returns the person's own group ids (from `group_members`); in the Direttivo and Allenatore views it returns null (no limit).
2. The group selector lists only those groups in the Giocatore view. "Tutti i gruppi" is renamed "I miei gruppi" there, and it is hidden when the person has only one group. The saved choice (`group-filter` in the browser) is reset when it is not one of the person's groups.
3. Every page that follows the group choice applies the scope: Eventi (list, week calendar, month view), Home (next event, week strip, news, figures), Statistiche, Campionato, the bell and the unanswered window, Presenze for a person who is also a coach (staff views stay unlimited). A person in the player view who is a board member sees exactly what a plain player in the same groups sees. Add a check to `scripts/ui-check.mjs`: with the test board account in the Giocatore view, no event of a group the account does not belong to appears anywhere.
4. Announcements addressed to the whole club stay visible; announcements addressed to other groups only follow the existing rules.
5. Ask Davide in the final report whether club wide results (Campionato of the other categories) should stay visible to players on a separate tab; the default is no.

Proof: a test account that is a board member in groups A only, in the Giocatore view: the selector shows A only, "Tutti" is not offered, the events, Home, Statistiche and Campionato show only A; in the Direttivo view everything is as before. A real player account behaves the same.

## D5. The test board account may be gone

Davide: "maybe I removed by mistake the direttivo prova account."

This is a data check, not code. Member data deletion disables the sign in account for good (new email, ban), so if "Prova Direttivo" (the board test account, `davidelegeanu+claudeboard@gmail.com`) was deleted, it cannot be used again, and the test sessions that use `TEST_BOARD_EMAIL` fail to sign in. Check with:
`select u.id, u.email, u.banned_until, p.first_name, p.last_name, p.deleted_at from auth.users u left join public.profiles p on p.id = u.id order by p.deleted_at nulls first, u.created_at;`
If the account is gone: create a new sign in account with the same email (the old address was freed by the deletion), then run the board script of `supabase/bootstrap_first_board.sql` for it with the name Prova Direttivo, and put the new password in the environment variable `TEST_BOARD_PASSWORD`. Do the same for the player account if it is gone.

## D6. Let the board decide what members must provide (idea, in two phases)

Davide's idea: "from the direttivo view we should be able to set up what we want from the players, so we can create for example the certificate (we add, we select as thing needed an upload and a start date, and we check a box for needing review, as duration we put 1 year), for the privacy consent (we could either put a check box for the player to check after he read the form), but it's just an idea."

What it means: today the club has two fixed requirements, the medical certificate (file, date of issue, valid one year, reviewed by staff) and the privacy consent (accept the notice). The idea is to let the board define requirements in the settings instead of having them built in: for each requirement a name, what the member has to give (a file upload, a date, a tick box), how long it stays valid, whether staff must review it, and when members are reminded.

Phase 1 (small, safe, do first): keep the two requirements as they are, but make the parts configurable in a new settings page "Documenti richiesti":
1. The certificate: the validity in months (12 by default) and whether staff review is needed (on by default). The database computes the end date from the issue date plus the configured months, and the reminder and status logic follow it.
2. The privacy consent: choose between the button "Accetto" and a tick box the member ticks after opening the notice. The date of acceptance is stored as today.
3. Only the board can change these settings. A change applies to certificates entered afterwards; existing ones keep their end date until they are edited.

Phase 2 (larger, only after Phase 1 and a design session with Davide): generic requirement types, so the board can add others (for example the league licence). Rules to settle first: which kinds of data are allowed (rule 6 of `AGENTS.md`: do not store more personal data than the spec lists, so each new requirement needs a clear reason and the board's explicit approval), who sees the file, how reminders work, how a requirement applies to groups, and how the two built in ones are migrated without losing data. Write a design note with tables, rules and screens and show it to Davide before any code.

Proof (Phase 1): change the certificate validity to 6 months in the settings, enter a certificate, and see the end date 6 months after the issue date, the status and the reminders follow; the tick box for the consent works and is stored; non board accounts cannot change the settings; database tests for each rule.

## Notes for the final report

1. Say what was fixed, what was tested and the numbers, and which items need Davide on a real iPhone or Android phone (D2 and D4 at least).
2. Add the decisions of this brief to `docs/DECISIONS.md` (two step optional; the player view shows only the person's own groups; certificate review queue and the rule about confirming one's own certificate; the idea of configurable requirements as phases 1 and 2) and the remarks to `docs/UI_BACKLOG.md`.
