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

## Setup status
1. GitHub repository: github.com/davidedele/hockey-club-app, private, with the first commit pushed (the planning files).
2. Claude project "Hockey Club App" on claude.ai holds the instructions and these notes.
3. App name: undecided. Candidates are HockeyHome, Spogliatoio, Cambio and Ingaggio. The repository can be renamed later.
4. Free credit: Davide has the Claude Code cloud session credit for Pro. It only works in cloud sessions, not in project chats or local terminal sessions, and it expires on 4 November 2026. The Claude GitHub App must be installed on this repository only. Building should happen in cloud sessions on this repository.
5. First session: build the app skeleton, the Italian text files and the database structure as migration files, without a live Supabase connection. Whether a cloud session can reach Supabase is not verified.
6. Plugins: the official Supabase plugin. Optional extras: Superpowers (plan before code), security-guidance, Context7 (current library docs) and cc-safety-net (blocks destructive commands). Ponytail only with care, and not for security or limit logic. Skip claude-mem, caveman and rtk, since independent tests found their savings small or absent.
7. Safety rule: use a separate Supabase test project for building and never connect the build to the club's live data.

## Still to do (Davide)
1. Answer the open questions in `SPEC.md` with the coach and the board.
2. Create a free Supabase test project.
3. Install the Claude GitHub App on this repository.
4. Start the first cloud session.
