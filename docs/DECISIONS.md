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
1. GitHub repository: github.com/davidedele/hockey-club-app, private, with the first commit pushed (the planning files).
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
