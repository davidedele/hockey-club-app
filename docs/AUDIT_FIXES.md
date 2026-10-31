# Audit notes and fix instructions

Written on 31 October 2026 after a full check of `main` (commit d948542). Nothing in this file has been fixed yet. Each fix below says what to change, where, why, and how to prove it works. Update the status line of a fix when it is done.

## 1. What was checked

1. Type check, unit tests (119), production build and dependency audit: all clean.
2. Database tests: 970 pass, run on a throwaway local Postgres.
3. A direct check of the database catalogue after applying all 34 migrations: every table has row level security, every privileged function has a fixed search path, nothing is open to people who are not signed in, and the tables without policies are only log tables used by server functions.
4. A read of the policies on every table that signed in users can write to, of the storage rules, of the invite functions, of the four server functions (calendar feed, reminders, league sync, league match) and of how emails and calendar files build their text.
5. A scan of all tracked files and the full git history for keys and passwords: nothing found.
6. The audit checklist from Cloudflare's security audit skill was used as a guide, in its guidance mode.

Not covered: the settings in the Supabase dashboard, a read of every source file and every migration line, and any test against the real test project (the cloud session cannot reach it).

The interface checker `scripts/ui-check.mjs` could not run, see fix 1.

## 2. Decisions from Davide on 31 October 2026

1. Staff (coaches and the board) may change a member's medical certificate. Staff may not change a member's privacy consent. The check below shows the database already works this way.
2. Team invite links are not seen as a problem: they are rarely used and can be given a very short expiry. No change is needed. A small optional tweak is described in fix 7.
3. A full audit with the Cloudflare skill is wanted, with a smaller scope proposed first, see section 5.
4. Davide wants to know how to test against the real test project, see section 4.

Move these four decisions into `docs/DECISIONS.md` when this file is committed.

## 3. Fixes

### Fix 1. The interface checker cannot run from a fresh copy

Status: not done. Priority: high, because the progress notes claim the checker passes and nobody can reproduce it.

Cause: `.gitignore` line 7 is `ui-check/`. That rule is meant for the output folder at the top of the repo, but without a leading slash it also matches `scripts/ui-check/`. The file `scripts/ui-check/fixtures.mjs`, which `scripts/ui-check.mjs` imports on its first lines, was therefore never committed.

Steps, on Davide's Mac:
1. Check that `scripts/ui-check/fixtures.mjs` exists there. If it does not, it has to be written again from the page list in `docs/UI_RULES.md`.
2. In `.gitignore` change `ui-check/` to `/ui-check/`.
3. Run `git check-ignore -v scripts/ui-check/fixtures.mjs`. It must print nothing.
4. Run `git status`. The folder `scripts/ui-check/` must now show as new. Commit it together with the `.gitignore` change.

Proof: in a fresh clone, `node scripts/ui-check.mjs` starts and does not stop with "Cannot find module fixtures.mjs".

After this, a cloud session can run the checker. It needs Playwright and a browser. In the cloud container the browser is pre installed and expects Playwright 1.56.x, so run `npm ci`, then `npm i --no-save playwright@1.56.1`, then `node scripts/ui-check.mjs`. This exact route is not proven yet, because the checker could not start. If the browser does not launch, pass its path or match the Playwright version to the installed browser folder name under `/opt/pw-browsers`.

### Fix 2. The database test script

Status: not done. Priority: medium. It matters for cloud sessions and for anyone on Linux, not for the club's users.

Two separate problems in `scripts/test-db.sh`:
1. The file is stored with mode 644 in git, so it is not executable. `npm run test:db` runs `./scripts/test-db.sh` and fails with "Permission denied" on a fresh clone. Fix either by changing the script line in `package.json` to `bash scripts/test-db.sh`, or by running `git update-index --chmod=+x scripts/test-db.sh` and committing. The first is simpler and survives any checkout.
2. On Linux, line 8 stops without any message. The `ls -d` command lists three possible Postgres folders, two of them Homebrew folders that do not exist on Linux, and `ls` then exits with code 2, which the script settings (`set -euo pipefail`) treat as a failure. Fix: add `|| true` at the end of the `ls ... | sort -V | tail -1` part inside the `$( ... )`.

Proof: on a Linux machine with Postgres 16 installed, `npm run test:db` ends with "ALL ... TESTS PASSED" and exit code 0, with no variable set. On the Mac it must still work as before.

Until it is fixed, a cloud session can run it with: `PG_BIN=/usr/lib/postgresql/16/bin bash scripts/test-db.sh`.

### Fix 3. A lone carriage return in calendar text

Status: not done. Priority: low, optional.

Cause: in `supabase/functions/calendar-feed/ics.ts`, `escapeText` replaces `\r\n` and `\n` with `\n` but leaves a lone `\r`. Some calendar apps treat a lone `\r` as a line break, so a value containing one could add extra lines to the calendar file.

How reachable it is: the event title and venue are typed in single line fields, and browsers remove line breaks from those. Only a staff member calling the database directly could store one. Staff are trusted, so the real risk is very small.

Change: in `escapeText` replace `.replace(/\r?\n/g, '\\n')` with `.replace(/\r\n|\r|\n/g, '\\n')`.

Test: add a case to `src/lib/ics.test.ts`: `escapeText('a\rb')` must give `a\nb` written with a backslash and the letter n, and must contain no raw carriage return.

My opinion: not needed now. It is one line, so do it the next time that file is touched, or skip it.

### Fix 4. The certificate reader loads its engine from a public CDN

Status: not decided. Priority: low.

Facts: `src/lib/ocr.ts` calls `createWorker('ita')`. In tesseract.js 7.0.0 the default worker script comes from `https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js`, and the engine core and the Italian language file also come from the internet. The photo itself is processed on the phone and never uploaded. The risk is that a compromised CDN could serve code that reads the certificate photo, which is health information. A pinned version on jsdelivr is very unlikely to be tampered with.

Cost of fixing: the engine core folder in `node_modules/tesseract.js-core` is 44 MB with all variants. A browser needs only some of the variants (the ones ending in `-lstm`), so the real size is likely 10 to 15 MB plus the Italian language file. That is large for a git repo and for each deploy.

Steps if it is done anyway:
1. Add the Italian language package as a dependency and copy the files that are needed into `public/tesseract/`: `worker.min.js` from `node_modules/tesseract.js/dist/`, the needed core files from `node_modules/tesseract.js-core/`, and the language file.
2. In `src/lib/ocr.ts` pass `workerPath`, `corePath` and `langPath` pointing at `/tesseract/...` as options to `createWorker`. Check the option names against the installed version before writing.
3. Make sure the service worker does not cache these large files at install time (they should load only when a certificate is read).
4. Test with Playwright with requests to `cdn.jsdelivr.net` blocked: reading a certificate photo must still work.

Other benefits of self hosting: it works offline and the CDN no longer sees the member's address when a certificate is read.

My opinion: low priority. Measure the real file sizes first. If they are over about 10 MB, keep the CDN and accept the small risk, or revisit before the club moves over from SportEasy.

### Fix 5. No Content-Security-Policy header

Status: not done. Priority: low, hardening only.

`netlify.toml` sets several security headers but no Content-Security-Policy. No way to inject script into the app was found, so this is only a second layer in case one appears later.

If done: add the header first as `Content-Security-Policy-Report-Only` and watch the browser console on every page, then switch it to enforcing. It must allow: the app itself, the Supabase project address for requests, Supabase storage for signed image links, `data:` and `blob:` for images and the certificate worker, and `cdn.jsdelivr.net` until fix 4 is done. A wrong policy breaks the app for everyone, so it must be tested on every page with the interface checker.

### Fix 6. Staff and consent files in storage (checked, no gap)

Status: checked, no change needed.

Result of the check: the privacy consent is a row in `member_documents` with the moment of acceptance and the path of the club's privacy notice. That notice is one PDF in the folder `club` of the `documents` bucket. It is uploaded and removed only by the board. Members' own folders (named after their id) contain only medical certificate files, whose names must match `<id>/medical_certificate-<number>.<pdf|jpg|png>` in the table. So no consent file sits in a member's folder, and staff touching those folders can only touch certificates, which is what Davide wants. The table rule that stops staff changing consent rows holds.

Small leftover, not worth a fix: at storage level staff could add a file with any name inside a member's folder. The table cannot point to it and the size and type limits still apply, so the effect is clutter at most.

### Fix 7. Team invite links, optional tweak

Status: accepted as it is. Priority: none.

Davide's view: group links are rarely used and can be given a short expiry. Agreed. One optional tweak: the form in `src/pages/Invites.tsx` starts with 30 days (`teamDays` is '30'). A shorter starting value such as 7 days and a smaller number of uses makes the safe choice the default. The database already limits a link to 90 days and 200 uses. No security fix is needed.

## 4. Testing against the real test project

Today the cloud session cannot reach Supabase: the network policy of the cloud environment refuses it (error 403 from the proxy), and the Supabase plugin fails for the same reason. Three ways to test:

1. **On Davide's Mac, in a local session.** The simplest. The app, `.env` and the Supabase plugin all work there, and a local session can run `npm run dev` and Playwright against the test project. The cost is that the free cloud credit (until 4 November 2026) is not used.
2. **In the cloud, with network access allowed.** In the cloud environment settings (the environment menu in the session's title bar, then Edit, then Network access), allow the host of the test project (`qekmoxtryxockzegzaii.supabase.co`) under Allowed domains. The documentation page is https://code.claude.com/docs/en/cloud-environments#network-access. For a real login test, create a dedicated test account in the test project and store its email and password as environment secrets of the cloud environment, never in the repository. Use the public (publishable) key only, never the secret key. This also lets the Supabase plugin connect.
3. **Without any network.** The interface checker (`scripts/ui-check.mjs`, after fix 1) answers every request from sample data, so it tests all screens with no connection. It does not test the real database rules, but those are covered by the 970 database tests.

Rule from `CLAUDE.md` that stays: only the test project, never the club's live data. Any write to the test project from a session must be asked about first.

## 5. Proposal for the full audit (smaller scope)

Status: waiting for Davide's go.

The skill's full mode builds a map of the code, sends several agents to hunt in separate areas, checks every candidate with a fresh agent and writes a report outside the repo. It uses many agent runs, so the scope is limited:

1. Profile: quick, which means one round of hunters, one final check of coverage, and one fresh verifier per candidate. Reported as partial coverage.
2. Scope: four areas only. (a) Database rules: policies, functions and storage rules in `supabase/migrations`. (b) Sign up, invites and tokens: `Join`, the invite functions and the calendar token. (c) The four server functions in `supabase/functions`. (d) The app code that handles files, links and personal data: documents, avatars, certificate reading, exports.
3. Budget: about 15 to 20 agent runs in total. This is an estimate. Each run reads a part of the code, so the token use is real but bounded.
4. Output: written outside the repo, in a folder in the session's home, and summarised here in plain language. Nothing in the repo changes.
5. Safety: source reading only. No target code is run except in a sandbox with no network, and the real test project is not touched.

## 6. Order of work, suggested

1. Fix 1 (Davide, on the Mac), then run the interface checker in a cloud session.
2. Fix 2.
3. Decide fix 4 after measuring the file sizes.
4. Fixes 3, 5 and 7 whenever convenient.
5. The full audit, after the owner of the project says go.
