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
12. Weekly limit: each player has a maximum number of trainings per week, set by the board according to what the player pays. It counts when the player answers "present". Games do not count. A warning goes to the board, the coach and the manager.
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
