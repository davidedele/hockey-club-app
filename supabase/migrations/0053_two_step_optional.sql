-- The two step sign in is optional for everybody, the board included (decision 130, replacing the grace period of 0041).
-- Nothing is required: club_settings.mfa_required_from is null by default and is cleared on every existing row.
-- mfa_ok() already treats a null date as "nothing required", so board powers never depend on the second step.
-- The column and the function stay: the board can switch the requirement on later from "Sicurezza", with a
-- warning about being locked out (decision 130).

alter table public.club_settings alter column mfa_required_from set default null;
update public.club_settings set mfa_required_from = null where mfa_required_from is not null;
