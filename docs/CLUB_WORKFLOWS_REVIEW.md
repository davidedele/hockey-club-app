# Club documents and event scheduling review

## Local setup

1. Use branch `codex/club-requests-bookings` in its own worktree. Install dependencies if needed and use the separate Supabase test project in the ignored `.env` file.
2. The database must already have migrations through 0062. Run the complete `supabase/apply/apply_0063_event_types.sql` file in the test project's SQL editor. Wait for success. This must commit before the next file because PostgreSQL needs the new event types committed before use.
3. Run the complete `supabase/apply/apply_0064_club_requests_bookings.sql` file separately. Both files stop on an unexpected or already applied schema. Do not combine them into one transaction, and do not rerun 0061 or 0062.
4. Run `npm run dev` from the worktree and open the local address it prints. Use a staff account and a player account in the test project.
5. Deploy the updated `send-reminders` function to the test project before checking actual email subjects for Teoria, Off-Ice or Evento. Local browser checks never send mail. The new types already work with the calendar feed at runtime; its type declaration is also updated in this branch.

## Documents

1. In Impostazioni club, Documenti e richieste, choose Aggiungi richiesta. Create a reading request with a PDF, an acceptance request, and a file upload request with staff review. Choose recipients and an optional submission deadline. No selected groups means every member.
2. PDFs can be selected from the club library or uploaded in the same form. Reading and acceptance need a source document. A file request can instead use instructions alone.
3. In Player view, open Profile, Documenti. Confirm a reading by checkbox and submit a signed PDF for the upload request. A stored confirmation shows its date; an upload awaiting review offers no second submission.
4. Staff see member status and received uploads in the request card. Request a correction with a note, then resubmit from the player account and approve it. A rejected upload can be replaced; completed confirmations and approved uploads cannot silently be overwritten.
5. Archive a request and confirm its responses are retained. Published contents are immutable: a replacement PDF or different instructions require a new request, preserving the association with the document previously accepted. Required files cannot be deleted through the app while referenced.
6. All document administration is in club settings. The player's document page contains their requests, certificate, privacy consent and a folded club library. The former club documents profile address redirects there. Personal request actions appear in Player view.

## Calendar, aliases and related events

1. In Events, select List, a season, event types, a search, a list scope and sorting. Open an event, edit and save it, then return through Events. The choices remain in the same browser tab, including after a refresh. The current account and role have separate list state. Week, Month and List remain durable browser preferences.
2. Also check Members search and page, Championship competition and list choices, and Attendance filters when following a member or event link and returning. New group selections still reset pagination where appropriate.
3. In group settings, enter a displayed league name. The league team selector is the source connection and is independent. Check calendar game titles, standings, league game details and player statistics. If one source name is mapped to different groups in different competitions, the competition resolves the display alias; an ambiguous name retains its official display rather than guessing.
4. Create Teoria, Off-Ice and Evento. They have attendance and discussion but no game or hockey lineup tools. They count ice only when a reservation is explicitly entered.
5. Open an event and choose Aggiungi evento collegato, then Prima or Dopo. Its groups are copied, its schedule starts next to the parent and its attendance is separate. The detail panel lists the related schedule; calendar entries have a neutral connecting treatment and an explicit related label. Only one relationship level is supported.
6. Edit or cancel the related event independently. Parent schedule edits and cancellations do not move or cancel the other event. Deleting a parent preserves the related event and removes its link. Linked weekly repetition is deliberately unavailable; create the related event for the selected occurrence.

## Ice accounting

1. In Impostazioni club, Piste, verify the default home game rink. Migration 0064 chooses the existing rink whose name contains Grande when available; otherwise select it explicitly.
2. Create a home game and confirm the default rink is selected. Set match times and the full ice reservation separately, including both dates when it ends after midnight. The reservation can include time before and after the game.
3. In Ore ghiaccio, check the total and CSV use the reservation, retain cancellations separately and include the reservation end date and review status. No explicit reservation keeps the previous training and game duration as a fallback. Historical events are not bulk rewritten.
4. A reservation spanning two months is split in the monthly report. The export is clipped to the selected accounting season. Away games without an explicit ice reservation are excluded from club ice charges. Older events whose rink or home/away information is unknown retain the unknown-rink accounting bucket for staff to resolve.
5. When the league or a direct update changes match start time, an existing reservation stays fixed and is flagged for review. Saving unrelated fields retains the flag. Correct the reservation or explicitly confirm that it has been checked. If the start time changes in the same edit, the flag remains until the resulting reservation is reviewed.

## Recorded local result

10 November 2026: production build, 238 unit tests and 1,772 database checks pass. The exact handoff files and repeat guards were tested in disposable PostgreSQL. Layout review covers 126 route and width cases with zero final findings, including six targeted reruns after enlarging related-event links. Eleven focused browser workflow cases pass; eight also pass in WebKit with dark mode and larger text. The general interaction suite completed with one outdated selector after adding the alias field; the shared group-name case now uses its label and passes on its own. The remaining completed cases were retained without repetition. Evidence and screenshots are in `docs/ui-review/club-workflows/`.

## Automated verification

1. `npm test` and `npm run build`.
2. `TEST_CLUB_APPLY_FILES=1 npm run test:db` tests the exact handoff files, repeat guards and all permission tests in disposable PostgreSQL. It never connects to Supabase.
3. `node scripts/ui-check.mjs` checks layouts with invented data. The usual Playwright browser installation is required. The changed screens must be inspected at 375 and 1280 pixels.
4. `node scripts/club-workflow-check.mjs` exercises request publication, player compliance, review, related event creation, home bookings and return context using invented data. `CLUB_CHECK_RESUME=1` resumes completed cases from its report; do not use resume when the code for those cases has changed. `CLUB_CHECK_WEBKIT=1` selects WebKit; `CLUB_CHECK_DARK=1` and `CLUB_CHECK_LARGE=1` exercise appearance variants.
5. These checks do not certify actual hosted storage, real email delivery or the club's document contents. Review them with the separate test project before merging and deploying.
