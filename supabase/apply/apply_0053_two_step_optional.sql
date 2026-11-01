-- Apply migration 0053 (two_step_optional) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration 0053 was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_settings' and column_name = 'mfa_required_from')) then
    raise exception 'Wrong project, or an earlier migration is missing: migration 0053 was not applied.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_settings' and column_name = 'mfa_required_from' and column_default is null) then
    raise exception 'Migration 0053 is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

-- The two step sign in is optional for everybody, the board included (decision 130, replacing the grace period of 0041).
-- Nothing is required: club_settings.mfa_required_from is null by default and is cleared on every existing row.
-- mfa_ok() already treats a null date as "nothing required", so board powers never depend on the second step.
-- The column and the function stay: the board can switch the requirement on later from "Sicurezza", with a
-- warning about being locked out (decision 130).

alter table public.club_settings alter column mfa_required_from set default null;
update public.club_settings set mfa_required_from = null where mfa_required_from is not null;

commit;
