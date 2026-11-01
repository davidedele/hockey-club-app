# Design note: generic requirement types (phase 2 of D6)

Status: a design only. Nothing in this note is built. It is to be read and decided by Davide and the board before any code (fix brief 3, D6; decision 132).

## What exists after phase 1

1. Two fixed requirements: the medical certificate (a file, a date of issue, a validity in months set by the board, optional staff review) and the privacy consent (a button or a tick box).
2. Their settings are three columns of `club_settings`: `certificate_months`, `certificate_review`, `consent_mode`, changed on the page "Documenti richiesti" by the board only.

## The idea

The board defines requirements in the settings instead of having them built in, for example the league licence. Each requirement has a name, what the member has to give, how long it stays valid, whether staff review it, and when members are reminded.

## Rules to settle first

1. Which kinds of data are allowed. `AGENTS.md` rule 6 says not to store more personal data than the spec lists. Proposal: a requirement may ask only for a file, a date or a tick box, never free text or numbers about the person, and creating one needs the board to write a reason that is kept with it and shown to members ("Perché lo chiediamo").
2. Who sees the file. Proposal: the member and the staff, as for the certificate; a requirement can be marked "board only", never wider.
3. How reminders work. Proposal: the same stages as the certificate (60, 30 and 7 days before, the day, 30 days after), only for requirements that expire, and each member can still switch reminders off as today.
4. How a requirement applies to groups. Proposal: to everybody by default, or to chosen groups; a member in several groups has it once.
5. How the two built in requirements are migrated without losing data. Proposal: they become two rows of the new table with fixed `slug` values (`medical_certificate`, `privacy_consent`), their existing `member_documents` rows are copied by a migration that is checked row by row (counts and a sample) before the old columns are dropped, and the screens for them keep their special parts (reading the date from a photo, the notice file).

## Proposed tables

1. `requirement_types`: `id`, `slug` (unique), `name`, `reason`, `needs_file` (boolean), `needs_date` (boolean), `needs_tick` (boolean), `valid_months` (null means it does not expire), `review` (boolean), `visibility` (`staff` or `board`), `active`, `created_by`, `created_at`.
2. `requirement_groups`: `requirement_id`, `group_id` (no rows means everybody).
3. `member_requirements`: `user_id`, `requirement_id`, `file_path`, `issued_on`, `ticked_at`, `valid_until` (computed by a trigger, never typed), `verified_at`, `verified_by`, `updated_at`; primary key `(user_id, requirement_id)`.

Row level security: a member reads and writes only their own row and only the allowed columns; staff read all rows of the types visible to them and confirm through a function like `verify_certificate`; only the board writes `requirement_types` and `requirement_groups`. Every rule gets a test, as for the other tables.

## Proposed screens

1. Settings, "Documenti richiesti": the list of requirements with an "Aggiungi richiesta" form (name, reason, what is asked, months, review, groups) and a switch to turn one off (it is never deleted while members have data for it).
2. The member's "Documenti": one card per requirement that applies to them, in the style of the certificate card.
3. Staff: the review list "Certificati da verificare" becomes "Documenti da verificare", with a column for the requirement.
4. Members table and Home figures: one line "Documenti" with the most urgent status, as now, and counts per requirement on Home.

## Open questions for Davide and the board

1. Which requirements does the club really want to add? If it is only the league licence, a third fixed requirement would be simpler than a generic system.
2. Is the reason text for each requirement enough for the privacy notice, or does the notice have to be updated every time one is added?
3. Should a requirement be allowed for a single group only (for example, a licence only for the A team)?

Recommendation: do not build phase 2 until a second requirement is actually needed.
