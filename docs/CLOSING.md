# Closing document: the full stop of the build

For Davide and the board. It says what the app does today, what was left out on purpose, what is built but waits for you, what must happen before real members join, and what the app cannot do. Written on 1 November 2026, after the third fix brief.

## 1. What the app does today, screen by screen

1. Sign in, join by invite link, forgot password. Email and password; an optional second step with an authenticator app. People join a team through the team's invite link.
2. Home. The next event with the answer buttons, the events still waiting for an answer this week, the latest announcements, the league position and last result, and the tile of the person's own season. Staff see "Da gestire": who has not answered, certificates missing, to verify and expiring.
3. Eventi. A list, a week view and a month view of trainings and games for the groups of the person, with the answer (present or absent), the venue with "Apri in Mappe", and the discussion of each event. Staff create, change, cancel and repeat events.
4. An event page. Details, who answers what, line-up, training plan with drills and files, discussion with read receipts, and for games the opponent, the score, the video link, the last meetings with the same team and the match predictions.
5. Presenze (staff). Season attendance per player, a grid per event, and the people who have not answered. Staff record who really came.
6. Statistiche. Team record and results, player tables (goals, assists, penalty minutes, goalies), predictions table, Fantahockey (three picks per game day, hidden until the first game starts, season table), hall of fame by season.
7. Campionato. Standings, next games and results of the club's competitions, read from the league website, with the club's league games in the calendar of the right group, and the tabs Marcatori, Assistenti, Punti and Penalità for all the players of the competition, added up from the game pages of the league.
8. Membri. The list of people with groups, number, position and, for staff, contacts and the state of their documents. A staff page "Certificati da verificare" lists the certificates that wait for a check.
9. Annunci. Announcements to groups or the whole club, optionally by email, pinned ones on top.
10. Esercizi. The drill library, reused in training plans.
11. Profilo. Personal data, Documenti (medical certificate and privacy consent), club documents, La mia stagione (numbers, milestones, and a card to share), absences, notification preferences, Sicurezza (the optional second step), the calendar link for the phone, and installing the app.
12. Impostazioni (board). Club name, logo and colours, required documents (certificate validity, staff review, how consent is given), groups, rinks and prices, ice hours with export, and invites.
13. The views Direttivo, Allenatore and Giocatore. The Giocatore view shows only the person's own groups and the player things (answers, reminders, the person's own certificate). The staff views are not limited.
14. Notifications. The bell, email reminders and, once set up, phone notifications.
15. Senza connessione. With no signal the app shows the saved next events, line-ups and plans, read only, with "Dati non aggiornati". The rule is in decision 137: only what the person may read, the next four weeks, no contacts, documents, ratings or messages, deleted at sign out.

## 2. What was decided not to build, and why

1. Generic requirement types (phase 2 of D6). Only a design note exists (`docs/DESIGN_REQUIRED_DOCUMENTS.md`). A third fixed requirement is simpler until the club really needs a second one.
2. Fee status. It stores payment information and payments are out of scope.
3. The coach's notes on players. They are personal data beyond what the spec lists (rule 6 of `AGENTS.md`).
4. The welcome list for new members. Postponed by decision 99.
5. Vibration on iPhone. Not replaced by anything; it is a limit of the phone (see section 5).
6. Club wide results of other categories for players. In the Giocatore view only the person's own groups show. A separate tab is an open question for Davide.

## 3. Built, but waiting for Davide

1. The apply files, to run in this order in the SQL Editor of the Supabase project, test project first: `apply_0036` to `apply_0056` in `supabase/apply`. On the test project the files up to 0035 are already applied. Each file stops by itself if it is run twice or on the wrong project.
2. Functions to deploy: `league-sync`, `league-match`, `calendar-feed` (redeploy it: the deployed one does not yet write the rink address), `league-details` (new: reads the finished league games for the player tables), `send-reminders` and `delete-member`.
3. Secrets in the project's Edge Functions settings: `REMINDER_SECRET`, `RESEND_API_KEY`, `REMINDER_FROM`, `APP_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and in the build `VITE_VAPID_PUBLIC_KEY`.
4. Push setup: `docs/SETUP_PUSH.md`. Until the build has the public key, the notification page says that phone notifications are not yet switched on by the club.
5. The real sign up test: a new person signs up with an invite link, confirms the email, answers an event, and the board deletes that person's data at the end.
6. Installing the app on phones: on iPhone, Safari, Share, Add to Home Screen (push needs this); on Android, the install prompt.
7. The board test account may be gone (D5 of fix brief 3). Check with the query in `docs/FIX_BRIEF_3.md`.
8. Interim for the second step: before 0053 is applied, `update public.club_settings set mfa_required_from = null;` removes the requirement at once.

## 4. Before real members join

1. The production project in an EU region on the Pro plan (`docs/SETUP_PRODUCTION.md`, section 1).
2. The final privacy notice, approved by the board and uploaded in the settings (`docs/PRIVACY_NOTICE_DRAFT.md`).
3. The email sender with the club's own domain (`docs/SETUP_EMAIL.md`), and "Confirm email" switched on.
4. A trial with a few real players for a few weeks, as the spec says, before the club moves over from SportEasy.
5. A backup routine tried once: a monthly dump kept outside Supabase and one restore into a scratch project.
6. Two board accounts, and the owner of the project knows how to reset a second step for someone who lost the phone (`docs/SETUP_2FA.md`).

## 5. Known limits

1. No vibration on iPhone Safari for the shift timer. The phone does not allow it. The warning is the underline of the time.
2. The reading of the certificate date from a photo loads its files from a public CDN (jsDelivr). If the CDN is blocked, the member types the date.
3. The "read" label of the certificate date says only that the program found the date in the photo. It is set by the phone, so staff review is the real check. The club can switch the review off in the settings, and then a typed date counts at once.
4. Every member can start the league update, limited to once every three hours.
5. A board member who loses the phone after the second step was required is locked out of board powers until the owner of the project resets the factor.
6. The league player tables count what the league site writes: a person written two ways splits into two rows, and the numbers can differ from the club's own statistics. There is no screen to merge two spellings yet.
7. Statistiche in the Giocatore view shows one group at a time, because the database functions take one group.
8. The saved copy for offline use is made by the app while it is open and online; a phone that never opened the app with signal has nothing to show. Not tried on a real phone.
9. The interface checker runs on Chromium; WebKit (the iPhone engine) was not run in the last rounds.
