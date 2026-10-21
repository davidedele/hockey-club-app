# Working rules for this project

## What this is
A mobile first web app (PWA) for an amateur ice hockey club, replacing SportEasy.
About 60 to 80 adult users across four teams. Real people will use it, so it must be built carefully.
Read `docs/SPEC.md` before doing anything, and `docs/SPORTEASY_NOTES.md` for how the current app behaves.

## Who is who
Davide plays for the A team and directs the project. Claude builds it. Davide reviews and decides.
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
