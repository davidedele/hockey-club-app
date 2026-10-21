# Hockey club app

A team management app for Hockey Club Sgularat Milano, built to replace SportEasy.
It covers trainings, games, attendance, line-ups, training plans and ratings for four teams (A, B, C1, C2).

Status: steps 1 and 2 of the build order work against a test database.
1. Sign in, invite links, groups, members, roles, profile pictures.
2. Events with weekly repeat, attendance answers, who said present, coach lists of missing answers and an attendance summary.
3. Club settings for staff: name, logo and game day colours.

Next: reminders, then the weekly training limit.

Start here:
1. `CLAUDE.md` holds the working rules for any chat or session on this project.
2. `docs/SPEC.md` holds what the app does and the build order.
3. `docs/SPORTEASY_NOTES.md` holds what the current app does, so nothing is lost.
4. `docs/SETUP_TEST_PROJECT.md` explains how to set up the test database and run the app and the tests.
5. `docs/PROGRESS.md` holds what has been done and what comes next.

Built with React, TypeScript and Vite, on Supabase (Postgres with row level security).
