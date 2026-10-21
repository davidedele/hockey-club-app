# Code and security review, 21 October 2026

Scope: all database migrations (0001 to 0008), every app screen, sign in and invite flows, file storage, dependencies and secrets. Checked against the Supabase test project and the local database tests.

## What holds
1. Every table has row level security. Anonymous visitors can read only the club name and logo, nothing else.
2. Grants start from nothing and add only what is needed. Players can change only their own name, jersey, position, phone and picture; email and id cannot be changed.
3. Every function that bypasses row level security checks the caller itself and fixes its search path. Staff only functions refuse players; invites store only a hash of the token and give one message for every failure.
4. Players cannot write answers directly, cannot answer for events of other groups or after the end, cannot give themselves a role, cannot see other people's contacts, absent answers or recorded attendance.
5. Files: the logo bucket accepts only PNG, JPEG and WebP up to 1 MB, written by staff only. Pictures are private, JPEG only, each person writes only in their own folder.
6. No raw HTML in the app, no secrets in the repository (`.env` is ignored), `npm audit` finds 0 vulnerabilities.
7. 203 database tests, each new rule checked to fail when broken.

## Fixed in this review
1. Signing out now also forgets a half used invite link, so the next person on a shared phone cannot pick it up.
2. Removing a member now also deletes their picture from storage.
3. The new password screen now shows the real reason a password is refused.
4. Six rules rewritten so the database checks the caller once per query instead of once per row (same rules, faster with many rows), and two missing indexes added on invites. Migration 0008.

## Open, needs Davide
1. The project folder is on the Desktop, which iCloud syncs. Some files inside `.git` (the `main` branch and the remote branch pointers) cannot be read because iCloud has moved them to the cloud. This is what caused the earlier git errors and it can corrupt the repository. Move the folder out of iCloud, for example to `~/Developer/hockey-club-app`, then check `git status` and `git push`.
2. Supabase dashboard, Authentication: set the minimum password length to 8 (the app asks for 8, the server allows 6) and switch on leaked password protection if the plan allows it.
3. Anyone can create an account without an invite. It gives no access (no profile, no data), but it can be used to send sign up emails. Later the sign up can move behind the invite on the server.
4. Removing a member deletes their profile, contacts, answers and picture, but the login account itself (email) stays in Supabase Auth. Deleting it needs a small server function; plan it before going live.
5. When the app is hosted, add security headers (content security policy, no framing) in the hosting settings.
