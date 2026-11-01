# Setup: two step sign in for the board

Everybody can turn on a second step at sign in (a 6 digit code from an authenticator app). It is optional for everybody, the board included (migration 0053 clears the date). The board can require it for the board from the page Sicurezza, with a date it chooses; the database then enforces it.

## 1. Apply the database change

1. Apply `supabase/apply/apply_0041_board_two_step.sql` in the SQL Editor (after the files with lower numbers). It stops by itself on the wrong project or on a second run.
2. Migration 0041 gave the board 30 days; migration 0053 removed the requirement (`club_settings.mfa_required_from` is empty). Nothing is required unless the board sets a date.

## 2. Check that the project allows it

1. Supabase dashboard, Authentication, Sign In / Providers (or Multi-Factor): "TOTP" (authenticator app) must be enabled. It is on by default for new projects.

## 3. Every board member enrols

1. Profile, Sicurezza, "Attiva la verifica". Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password) or type the key, then enter the 6 digit code.
2. From then on, signing in asks for the code after the password.
3. Keep at least two board accounts, so that one lost phone never locks the club out.

## What happens after the date

1. A board account whose session did not pass the second step is treated as a plain member by the database (`is_board()` and `is_staff()` are false for it): it cannot change settings, roles, members, invites or documents. It can still sign in, open Sicurezza, enrol, sign in again with the code, and everything works.
2. Coaches and players are not affected.
3. The board can move the date, or clear it to switch the rule off: in the SQL Editor, `update public.club_settings set mfa_required_from = null;` (the board can also do it from the page Sicurezza).

## If a board member loses the phone

1. An owner of the Supabase project opens Authentication, Users, finds the person, and removes their MFA factor (Remove MFA factor).
2. The person signs in with the password only, and enrols again under Profile, Sicurezza. Until the date has passed they keep their board powers meanwhile; after it, another board member does what they need, or the owner moves the date.
3. If every board member is locked out: an owner of the project removes the factors in the dashboard, or clears the date with the query above.

## What the database tests prove

1. Before the date a board session works without the second step.
2. After the date a board session at the password level cannot change the club settings or give roles; the same account with the second step can.
3. A coach and a player are not affected, and with no date nothing is required.
