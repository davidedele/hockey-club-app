# Working rules for this project

These rules apply to every AI coding agent working in this repository.

## What this is
A mobile first web app (PWA) for an amateur ice hockey club, replacing SportEasy.
About 60 to 80 adult users across four teams. Real people will use it, so it must be built carefully.
Read `docs/SPEC.md` before doing anything, and `docs/SPORTEASY_NOTES.md` for how the current app behaves.

## Who is who
Davide plays for the A team and directs the project. The AI coding agents (Codex and Claude Code) build it. Davide reviews and decides.
Interface language is Italian. English can be added later, so keep all text in translation files from the start.

## How to work
1. Build in small steps, in the order in the spec. Finish and test one step before the next.
2. Keep it lightweight. No feature, library or abstraction that the spec does not need.
3. Use a separate Supabase test project for development. Never connect to the club's live data during the build.
4. Ask before any destructive action (dropping tables, deleting a project, resetting a branch).
5. Security rules in the database come first: every table has row level security, and each rule gets a test.
6. Do not enter, store or show more personal data than the spec lists.
7. Test on a phone sized screen first.

## Writing rules
1. No dashes (em dashes or hyphen style bullet markers) in any text written for Davide. Use numbered lists or plain sentences.
2. Commit messages and public repo text only describe what changed. Never mention the writing process, the voice, or who wrote it.
3. No co-author, session link or generated-by lines in commits, in code comments or in the repo. Everything reads as Davide's own work under his name.

## Deliverables
Code goes in this folder. Hand over work as small, reviewable changes with a plain description of what changed and how to try it.

## Memory between sessions
1. `docs/DECISIONS.md` holds the decisions made so far. When Davide gives a new decision, add it there.
2. `docs/PROGRESS.md` holds the current state and what comes next. Update it at the end of every session.
3. Read both files, together with `docs/SPEC.md`, at the start of every session.

## Working in parallel with several agents
1. Each agent works in its own git worktree and on its own branch (for example `codex/attendance` or `claude/league`). Never work on `main` directly and never touch another agent's worktree.
2. Start from an up to date `main`. Davide merges finished branches through pull requests, one at a time.
3. Only one agent writes database migrations at a time. Before creating a migration, check the highest number on `main` and on open branches, and use the next free one.
4. Stay inside the assigned task. Do not reformat or rewrite files outside it.
5. Never commit `.env` or any secret. Each worktree gets its own copy of `.env`.
6. At the end of a task, add what changed and what comes next to `docs/PROGRESS.md` in your own branch, and record new decisions in `docs/DECISIONS.md`.
7. Finish with a short plain description of what changed, which tests passed, and how to try it.
