# Decisions and setup notes

Recorded on 21 October 2026. Read together with `SPEC.md` and `SPORTEASY_NOTES.md`.

## Decisions from Davide
1. Platform: an installable web app (PWA) that also works as a website, with the same login on both.
2. Backend: Supabase. Davide was undecided and accepted this as the default.
3. First version: trainings and attendance, games with scores, player ratings and MVP, line-ups per training, training plans with drill uploads, and a calendar feed for Apple and Google calendars. Interactive training content can come later.
4. Language: Italian first, English later.
5. Groups: A, B, C1, C2. A player can belong to several groups (some play in two). Events are created once and shown to the chosen groups. There is no separate general group.
6. Attendance: answering yes or no must be required and hard to ignore. The coach complains that many players do not answer.
7. Ratings: every player rates each teammate from 1 to 10 and votes for an MVP. The MVP is the player with the most votes. Ratings are visible only after you have voted. There are no training ratings.
8. Rating privacy: Davide believes managers can see who gave which rating in SportEasy. This is unconfirmed and still open in the spec.
9. Chat: event discussions are enough, mainly useful for trainings.
10. Line-ups: different at every training. Game line-ups are given before the match in person, so entering them in the app is optional.
11. Training plans: the coach uses a whiteboard today. Davide wants something interactive and a library of drills, and the coach should choose whether a plan stays visible after the training or is hidden.
12. (Dropped on 28 October, see item 41.) Weekly limit: each player has a maximum number of trainings per week, set by the board according to what the player pays. It counts when the player answers "present". Games do not count. A warning goes to the board, the coach and the manager.
13. Decision makers: the coach and a few board members. Davide directs the project and Claude builds it.
14. Not wanted: payments and championships (not used in SportEasy today).
15. Real use: this will be given to the team, so it must be built carefully.

## Answers to the open questions (21 October 2026)
1. Manager role: can do everything needed to run the club, from choosing who trains to adding trainings and editing the roster.
2. Rating privacy: board members and managers can see who gave which rating.
3. Weekly plans: the number of trainings a player may attend depends on what the player pays. How plans are set and edited can be added later.
4. Events are not shown to all groups by default. The creator chooses the groups.
5. Leaving SportEasy is decided by the managers. There is no date. The app must be finished first.
6. The week starts on Monday.

## Decisions for build step 1 (21 October 2026)
1. The first board account is created by one manual step in the test project.
2. Invite links are single use and expire after one week. Davide wants to develop the app before refining this, so the invite details can be revisited.
3. Only the board can assign roles and edit groups.
4. A person who joins through an invite link needs no board approval. The link itself is the approval.
5. The app name stays undecided. A neutral working name is used in the code.
6. Email and phone are visible to coaches and the board only. Players see names, jersey numbers, positions and groups.
7. Coaches have the same rights as the board for running the roster: editing member profiles, adding or removing group members and creating invites. Only the board assigns roles, edits groups and removes members.
8. Players edit their own name, jersey number, position and phone. Staff can correct them.
9. Login uses email confirmation and password reset by email.
10. An invite is marked used only when someone has actually joined with it. A member who is already signed in must press a button to use an invite, so opening a link by accident uses nothing.

## Assumptions made while building step 1 (to confirm)
1. The "manager and president" roles are one role called board.
2. Every member can see every other member's name and group, across the whole club.
3. Position values are goalie, defence and forward, matching the line-up slots.
4. A person has no role by default, which means player.
5. The last board member cannot be removed, so the club cannot lock itself out.

## Decisions about reminders (21 October 2026)
1. The first reminder for a training goes out the day before, once.
2. Closer to the event reminders can become more frequent, for example every hour once 12 hours are left, and also for other time sensitive things. The board and the managers should be able to manage these reminders and notifications themselves.
3. Push notifications first. Email only if it is worth it.
4. Coaches get a daily short list of who has not answered, so they can contact those people directly when they want.
5. Email sender: Davide has the domain onlyai.lol and plans to remove its connection to the Microsoft environment soon. Use it only for testing, on a separate sending address, until that is done.

## Assumptions made while building step 2 (to confirm)
1. Coaches and the board can both create, change and delete events and record attendance, for any group. There is no limit to one coach per team yet.
2. Players see only their own answers. Coaches and the board see everyone's answers and who has not answered.
3. A player can change an answer until the event ends. After that the answer is locked.
4. The banner counts events in the next 14 days with no answer. The events list shows every upcoming event, and marks each one that has no answer.
5. Event times are always entered and shown in Italian time, whatever the phone's time zone. A weekly repeat keeps the same clock time, also across the change between summer and winter time.
6. A weekly repeat is chosen when a training is created, up to 53 weeks in total. Changing an event afterwards changes that one event. To change a whole series, delete this event and the following ones and create it again. Groups are also chosen at creation and cannot be changed in the edit form yet.
7. For a game the opponent is required, with home or away. Staff enter the final score on the event page.
8. Deleting an event also deletes its answers and recorded attendance. The screen names the event and asks for confirmation first.
9. Recorded attendance can be entered after the event starts. It stores only the status (on time, late, excused, unexcused, injured, not called up).
10. Not built yet: reminders by push or email. The rules are in the reminder decisions above.
11. The coach list "Da contattare" shows people with no answer for events in the next 3, 7 or 14 days (7 by default), with phone and email, most missing first. It is a screen in the app for coaches and the board, not a daily message yet.
12. The attendance summary counts finished events shown to a player's groups. "Tutta la stagione" means every finished event so far, and there is a last 30 days view. A person in two groups of one event counts it once.

## Setup status
1. GitHub repository: github.com/davidedele/hockey-club-app, public (Davide, 21 October), with the first commit pushed (the planning files).
2. Claude project "Hockey Club App" on claude.ai holds the instructions and these notes.
3. App name: undecided. Candidates are HockeyHome, Spogliatoio, Cambio and Ingaggio. The repository can be renamed later.
4. Free credit: Davide has the Claude Code cloud session credit for Pro. It only works in cloud sessions, not in project chats or local terminal sessions, and it expires on 4 November 2026. The Claude GitHub App must be installed on this repository only. Building should happen in cloud sessions on this repository.
5. First session: build the app skeleton, the Italian text files and the database structure as migration files, without a live Supabase connection. Whether a cloud session can reach Supabase is not verified.
6. Plugins: the official Supabase plugin. Optional extras: Superpowers (plan before code), security-guidance, Context7 (current library docs) and cc-safety-net (blocks destructive commands). Ponytail only with care, and not for security or limit logic. Skip claude-mem, caveman and rtk, since independent tests found their savings small or absent.
7. Safety rule: use a separate Supabase test project for building and never connect the build to the club's live data.

## Decisions about the look
1. Direction: a rink schedule board. Events are grouped per day with a date column, the time is the strongest element in each row, and events still waiting for an answer carry an accent rule on the left.
2. Type: Barlow Condensed 600 for titles and times, Barlow 400 and 500 for text. Both are under the SIL Open Font License (licence file in public/fonts), self hosted as woff2 so no outside request is made and the app works offline. Only three weights are used.
3. Colour: one rink blue accent. Red is used only for danger and errors. Lists sit on bordered surfaces. Light and dark follow the phone setting.
4. Sizes: body text 16px, secondary 14px, tap targets at least 44px, visible focus outline, reduced motion respected.
5. The members list has a number column on the left of each name, and the tab bar uses simple line icons.
6. Update after comparing with SportEasy (21 October): light ice blue look with a red "now" line, a week strip at the top, the next event as a big panel with large Presente and Assente buttons, the following events as rows with one tap tick and cross. Header with club logo, notifications bell with a count and profile picture. A floating rounded tab bar at the bottom (Eventi, Messaggi, Squadra, Presenze), done properly on both phone and computer.
7. Game day: the next game gets its own panel in two team colours chosen by staff (for the A team black and yellow). Staff set the colours in the app (see 10 and 11).
8. Built on 21 October with Archivo and Archivo Narrow (SIL Open Font License, licence in public/fonts). On computers a left sidebar replaces the floating tab bar, like the SportEasy website. Tabs: Eventi, Membri, Profilo for everyone, plus Presenze and Inviti for staff. The attendance summary moved to its own address, /attendance.
9. Players see how many people said present for an event and who they are, as in SportEasy (Davide, 21 October). Absent answers and recorded attendance stay visible to staff only. Functions `event_present_counts` (migration 0004) and `event_present_people` (migration 0005).
10. Nothing about one club is built in (Davide, 21 October). Staff set the club name, the logo and the game day colours in the app (Profilo, Impostazioni del club). They are stored in `club_settings` (one row, readable by everyone because the sign in page shows them, changeable by staff only) and the logo in a public storage bucket `club` (PNG, JPEG or WebP, at most 1 MB, upload and removal by staff only). Migration 0006. Without a logo the app shows a stick and puck.
11. Game day colours: the club pair is the default; each group can have its own pair (see 15).
12. On computers, club settings and the own profile sit at the bottom left of the sidebar. On phones they are reached from Profilo.
13. The week strip on the events home works as a calendar: arrows move by week, tapping a day shows that day's events, tapping it again or Mostra tutti goes back.
14. Profile pictures (Davide, 21 October): optional, each person adds or removes their own on Profilo. Only club members can see them: private storage bucket `avatars`, shown through links that expire after an hour. The app crops the photo to a square, shrinks it to 256 pixels and saves it as JPEG, which also drops metadata such as location. Each person can only write in their own folder; the board can remove any picture. Migration 0007.

## Decisions from the coach's suggestions (21 October)
1. Yearly medical visit: each player has a certificate expiry date and an uploaded photo or PDF of the certificate. Reminder to the player 30 days before expiry. The uploaded file is private. Who sees what: board and coaches see both dates and files (Davide, 21 October). For now staff and board are treated the same.
2. Storing medical certificates needs the club's agreement first (Davide: yes). The board has agreed (Davide, 21 October). Members still have to be told what is stored before it goes live.
3. Fewer steps is a rule for every screen: the most frequent actions (answer an event, see the next training, see the line-up) take one tap from the home screen.
4. Training plans are on paper today. Upload stays in build step 6. Wanted later: an interactive plan builder and a drill library, possibly with an AI helper. Not specified yet, to discuss with the coach.
5. Confirmation email flow: the invite link is remembered on the device while the person confirms, and the person is added to the club wherever the confirmation link lands. The check email screen has a resend button with a 60 second wait. Supabase must allow the app address under Authentication, URL Configuration, Redirect URLs.
6. Staff can send a push notification on demand (short message, choice of team). Built with step 9. On iPhone the app must be on the home screen.

## Still to do (Davide)
1. Answer the open questions in `SPEC.md` with the coach and the board.
2. Create a free Supabase test project.
3. Install the Claude GitHub App on this repository.
4. Start the first cloud session.

## Decisions about settings (21 October)
15. Groups are set up by the board only: name, short code, own game day colours (or the club colours), a picture, and a default weekly training limit. The board can add groups and remove them; a group cannot be removed while an event belongs only to it. Migration 0009.
16. Settings live in one place, Impostazioni: Club (staff), Gruppi (board), Inviti (staff). Invites are no longer a tab. On computers Impostazioni is at the bottom of the sidebar; on phones it is reached from Profilo.
17. Coaches can still change the club logo, but group pictures are for the board only.
18. Computer layout (from 768 pixels wide): sidebar, no top bar. Events home is a week calendar: the next event as a wide panel, then one column per day with the events and their answer buttons; arrows move by week. Members is a searchable table with photo, number, role, groups and, for staff, email and phone. Phones keep the week strip and the list.
19. Neutral sign in (Davide, 21 October): the sign in, join and password pages show only the app name; the club name and logo appear after signing in. Club settings are no longer readable by visitors who are not signed in (migration 0010).
20. Computer home is a club dashboard (Davide left the choice to Claude): a banner in the club colours with logo, name, number of members, events this week and own attendance this season; the next event and a "Da rispondere" list side by side; the week calendar below. Dark navy sidebar, tinted page, denser spacing. Own attendance counts events of the person's groups since 1 September: recorded on time or late, or answered present when nothing was recorded.
21. Design plugins: UI Verify is connected but has no project yet (it compares screenshots between versions and needs a project on its site); UI Color Palette's colour tools were not available in the session.
22. Settings review (21 October). Club name, logo and colours are set by the board only, like the groups (migration 0011); coaches keep invites. The board has an Impostazioni area (club, groups, invites); a coach goes straight to Inviti. On phones settings are a gear in the header next to the own picture, and the Profilo tab is gone because the picture already opens the profile. The club colours are named as such because they colour the home banner as well as game days. The weekly limit field is hidden until the weekly limit itself is built (step 3); the column stays. Group badges (picture or short code in the group colours) now appear in the members filter. Invites show who used them and can be shared with the phone's share sheet.

## Decisions about game statistics, ratings and MVP (21 October)
23. Numbers per player and game (Davide): goals, assists and penalty minutes; goalies also have shots against and saves. No plus/minus. Only staff enter them, on the game's page, for the people who played. The whole club sees game numbers and the season statistics. Migration 0012.
24. Who played a game: recorded as on time or late or, with nothing recorded, answered present. The same rule as the own attendance on the home. Staff fix the attendance first if the list of who played is wrong.
25. Ratings and MVP come now with the statistics (Davide). After the game ends, everyone who played gives each teammate a rating from 1 to 10 (optional per teammate) and must pick one MVP. Nobody rates or picks themself. A vote is final, so nobody can change it after seeing the others' votes.
26. Players who played see the ratings and MVP votes of a game only after they have voted. Staff and members who did not play see them once the game is over. The season table shows the average rating to everyone, so it already counts a game for a player who has not voted on it yet. Accepted as a small leak, because the season figure mixes many games.
27. Who rated or voted for whom is shown to nobody, the board included: each person reads only their own ratings and vote. This answers the open point in `SPEC.md` section 10 for now with the more private choice; it can be opened to the board later if the board asks.
28. The MVP of a game is whoever has the most votes; a tie makes each of them MVP. The season MVP count is the number of games a player was MVP. The average rating is over all ratings received in the season.
29. Statistics page (Statistiche, a tab for everyone): season (from 1 September) and group filters, the team's results from the final scores in the group's colours, then a players table (games, goals, assists, points, penalty minutes, MVP, average rating) and a goalies table (games, shots against, saves, save percentage, goals against, MVP, average rating). It opens on the person's own first group. Seasons before 2026/27 are not offered, because the app holds no older games.
30. Phone numbers (Davide, 21 October): Italian mobile numbers are shown and saved as "333 123 4567", with "+39 " in front when the country code was typed. Landlines and foreign numbers stay as typed.

## Decisions after the idea board (22 October)
31. Davide chose five ideas from the idea board: jersey colour per game, absence periods, sharing to WhatsApp, a bureaucracy page per member, and a championship page with the league's fixtures, all results and standings. The championship page changes the spec, which had left championships and standings out.
32. Jersey colour: the club has two jerseys that the board names in Impostazioni > Club, Chiara and Scura unless changed (Davide). Staff set one of them, or nothing, on a game. It shows on the game's page, on the next game panel and in the WhatsApp text. Migration 0013.
33. Absence periods: a person marks themself away from one day to another (Italian dates, both included), and staff can do it for anyone, for example an injured player. Every event of the person's groups in the range gets an Absent answer, including events created later and events of a group they join later. Their own answer always wins. Removing a period removes its answers for events that have not ended; past events keep them. The optional reason (work, injury, illness, travel, other) is seen by the person and staff only. A period can start in the past but must end today or later, and lasts at most a year. Moving an event to another date does not recheck periods. Migration 0013.
34. WhatsApp sharing opens WhatsApp with a ready text and the link to the event, so the person picks the chat; nothing is sent by the app. Anyone can share an upcoming event or a final result; staff can also send the list of who has not answered.
35. Bureaucracy page per member (Davide): for now the medical certificate (expiry date and file) and the privacy consent; built so more kinds can be added later. The member, coaches and the board see all of it. The member or staff enter the certificate; only the member gives or withdraws consent, and the moment is recorded by the database. The board uploads the club's privacy notice as a PDF; a new notice asks everyone to accept again. Files sit in a private bucket and open through links that last ten minutes; photos are redrawn as JPEG of at most 1800 pixels, which also drops their metadata. A certificate counts as expiring 30 days before its date. Until push notifications exist, the reminder is a line at the top of the app for the member, and staff see each member's status in the members list. Migration 0014.
36. Championship page (Davide): the app reads fixtures, results and standings from the league's website (legahockeylibertas.it). Best to ask the league for an OK; if the site changes, the reading has to be adjusted.
37. How the league is read: a Supabase function (league-sync) reads the site's match pages (past and future, about 10 pages) and the standings of each competition, at most every three hours, when someone opens Eventi or Campionato; staff can ask for a fresh reading. The site has no data feed, so the function reads its pages; the format was checked on the real site on 22 October (147 matches, 8 competitions). The function keeps a note of when it last read and whether it worked; the page says so. Migration 0015.
38. Groups and league teams: the board links each group to its league team and the competitions it plays (Impostazioni, Gruppi), because the club's teams share names on the league site: HC SGULARAT plays Categoria A, B and C, and HC SGULARAT YELLOW plays Categoria C. Seen on the site on 22 October: A is HC SGULARAT in Categoria A, Coppa LHL Cat A and Coppa delle Regioni; B is HC SGULARAT in Categoria B; one C team is HC SGULARAT in Categoria C (and Coppa LHL Cat C); the other is HC SGULARAT YELLOW in Categoria C.
39. League games in the calendar: a linked group's league matches become games in the app (opponent, home or away, rink, time; meetup an hour before and 90 minutes long unless staff change them). A game created by hand on the same day for that group is linked instead of doubled. Later changes on the league site move the game, and a result fills the score. A league game deleted by staff is not created again. A match between two of the club's teams appears for both groups.
40. Navigation: one item, Campionato, holds the league page and the club's own statistics, with a switch at the top, so the phone tab bar stays at three items for players.

## Decisions of 28 October
41. The weekly training limit is dropped (Davide). No plans per player, no warnings. The spec, the build order and the screens no longer include it. The column `groups.weekly_limit` from migration 0009 is still in the database and unused.
42. Ice hours (a request from the club president, answered by Davide): the board counts the hours of ice used, per rink and per month, to compare with the venue's flat monthly fee and its end of season count. The booked ice is the event's own start and end. There are two rinks. An event with nobody present still counts. A cancelled event is kept, marked cancelled, and counted apart; deleting is for mistakes. A recap page for the board with an export to a spreadsheet file. An hourly price per rink is optional and board only.
43. Weekly plans per person per season (answered on 23 October) are no longer needed because of item 41. SportEasy gives the club no line-ups or training plans, so those wait until after the move.
44. The club has a fifth group, Start, which the board adds in Impostazioni, Gruppi. The president gets a guest style account to look at the app once it is ready to show.
