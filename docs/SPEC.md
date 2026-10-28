# Hockey club app: specification

## 1. Goal
Replace SportEasy, which the club pays for, with an app the club owns.
Keep what the club really uses (trainings, attendance, games, ratings, MVP, chat).
Add what SportEasy lacks: line-ups per training, training plans and drills that players see before going on the ice, and a count of the ice hours the club uses.

## 2. Users and roles
About 60 to 80 adults. No minors.
Roles:
1. Player.
2. Coach (one per team). Creates trainings, sets line-ups, uploads training plans.
3. Manager and president (board). Manage members and groups, see the ice hours, and receive warnings.
A person can have several roles and belong to several groups.
Login: email and password, the same on the phone app and the website. Joining is by invite link.

## 3. Groups
Four groups: A, B, C1, C2. There is no separate "general" group.
A player can be in any number of groups (many play in two).
Each group has an invite link that adds a person to that group.
An event is created once and is shown to the groups chosen for it: one, several, or all.
A player in two target groups sees the event once and answers once.

## 4. Events
Two types: training and game.
Fields: title, start time, end time, meetup time (usually an hour before the start), venue, groups.
Trainings can repeat weekly (the club trains on Tuesday, Thursday and Sunday; the Thursday session runs about 22:30 to 23:55 with meetup at 21:30).
Games also have: opponent, home or away, final score.

## 5. Attendance
Every player must answer yes or no for each event shown to them.
The answer must be hard to ignore:
1. Automatic request when the event is created, then reminders until answered.
2. A banner in the app until the answer is given.
3. The coach sees a list of who has not answered. In SportEasy about 33 of 73 had not answered a training.
After the event the coach can record who actually came (on time, late, excused, unexcused, injured, not called up).
A season attendance summary per player, and a per event grid, are available to the coach and board.

## 6. Ice hours
The weekly training limit was dropped on 28 October (Davide), so there is no plan per player and no limit warning.
In its place the board counts the ice the club uses, because the venue bills a monthly flat fee and does a real count with an adjustment at the end of the season, and the club has to compare its own hours with theirs.
Every training and game has a rink (the club uses two). The booked ice is the event's own start and end time, so an event from 14:00 to 15:30 is 1.5 hours. Staff can adjust the times.
An event with nobody present still counts, because the ice is paid for anyway. A cancelled event is kept and marked cancelled, and its hours are counted apart, so the board can see what was booked and then dropped. Deleting stays for mistakes and does not count.
A recap page for the board shows the hours per rink, per month and for the season, the cancelled hours, and an export to a file that opens in Excel. An hourly price per rink is optional: if the board enters one, the page also shows the cost. Coaches and players never see prices.

## 7. Calendar feed
Each user gets a private subscription link (an ICS feed).
Apple Calendar and Google Calendar subscribe once and show all of the user's events, updated automatically.
It is one way: the app updates the calendar, not the other way round. Google can take hours to refresh.

## 8. Line-ups
The coach sets line-ups per training, different every time.
Slots: forward lines (left wing, centre, right wing), defence pairs (left, right), and goalies.
The coach picks players from those who answered present, in a simple drag or tap interface.
For games, line-ups are optional and entered before the match.
Players see the line-up for an event they belong to.

## 9. Training plans and drills
The coach prepares the plan before the session so less time is lost explaining on the ice.
1. Upload drills as images or PDF, or add a video link (long videos work better as links).
2. A drill library to reuse drills in several trainings.
3. For each plan, the coach chooses whether it stays visible after the session or is hidden.
Later: an interactive drill board (a rink where the coach places players and draws movement).

## 10. Games, ratings and MVP
After a game, every player rates each teammate from 1 to 10 and votes for one MVP.
A player cannot rate themself.
The MVP is the player with the most votes.
Players see the ratings only after they have voted.
The overall result shows the average per player.
Open point: whether board members can see who gave which rating. This is a privacy choice for the club, to be confirmed with the board. Until then nobody sees it (decided 21 October).
There are no training ratings.
Championship (decided 22 October): a page with the standings, next games and results of each competition the club's teams play, read from the league's website, and the club's league games added to the calendar of the right group.
Game statistics (decided 21 October): staff enter goals, assists and penalty minutes per player, and shots against and saves for goalies. The whole club sees them per game and per season.

## 11. Discussion
Each event has its own discussion thread, with read receipts, archived after a period without messages.
No separate general chat in the first version.

## 12. Notifications
Push notifications and email. Each user can choose what they receive.
Needed first: new event, attendance reminder, change of time or venue.
On iPhone, push notifications need the app to be added to the home screen.

## 13. Data and privacy
Keep the minimum: name, email, phone (optional), jersey number, position, group membership, profile picture (optional, added by the person, decided 21 October), game numbers, ratings and MVP votes (decided 21 October), absence periods with an optional reason (22 October), medical certificate expiry and file, privacy consent date (22 October).
Not needed: date of birth, height, weight, parent fields.
Row level security in the database: players see their own groups' events, their own answers and who said present for those events (decided 21 October); ratings follow the rule above; only the board sees plans and warnings.
The club holds members' data, so the board should agree to the move and members should be told what is stored.

## 14. Technology
1. Backend: Supabase (login, Postgres database, file storage, scheduled jobs, edge functions).
2. App: one installable web app (PWA) in React and TypeScript, mobile first, Italian first.
3. Hosting: Cloudflare Pages or Vercel.
4. Use a separate Supabase test project while building.

## 15. Build order
1. Login, invite links, groups, members.
2. Events with weekly repeat, and attendance with reminders.
3. Ice hours per rink, with export.
4. Calendar subscription feed.
5. Line-ups.
6. Training plans, drill library and uploads.
7. Games, ratings and MVP.
8. Event discussions.
9. Push notifications.
10. Interactive drill board.
Move the club over only when steps 1 to 4 have been used by a small group of real players for a few weeks.

## 16. Out of scope
Payments, parent accounts, sponsor pages. SportEasy has them and the club does not use them. Championships and standings were out of scope too, until Davide asked on 22 October for a championship page fed by the league's website.

## 17. Open questions
1. Exactly what the manager role can see and do.
2. Whether board members can see who rated whom.
3. Names of the two rinks, and whether the price per hour differs between them.
4. Whether to show an event to all groups by default.
5. Who decides to switch away from SportEasy, and when.
