// Writes supabase/apply/apply_00NN_name.sql for Davide to paste in the SQL Editor of a Supabase project:
// a guard that stops by itself on the wrong project or on a second run, then the migration in one transaction.
// Run: node scripts/make-apply.mjs        (writes every file listed below)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '../..')

// number: [name, "needs" = something the migration before it left behind, "done" = what this migration adds]
const col = (table, column) => `exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = '${table}' and column_name = '${column}')`
const FILES = {
  '0036': ['certificate_issue_date', `to_regclass('public.profiles') is not null and to_regclass('public.member_documents') is not null and to_regprocedure('public.certificates_due(timestamptz)') is not null`, col('member_documents', 'issued_on')],
  '0037': ['rink_address', `to_regclass('public.rinks') is not null and to_regprocedure('public.calendar_events(text)') is not null and ${col('member_documents', 'issued_on')}`, col('rinks', 'address')],
  '0038': ['my_season', `to_regclass('public.game_ratings') is not null and ${col('rinks', 'address')}`, `to_regprocedure('public.my_season(integer)') is not null`],
  '0039': ['push_notifications', `to_regclass('public.reminder_prefs') is not null and to_regprocedure('public.my_season(integer)') is not null`, `to_regclass('public.push_subscriptions') is not null`],
  '0040': ['delete_member_data', `to_regclass('public.push_subscriptions') is not null`, col('profiles', 'deleted_at')],
  '0041': ['board_two_step', col('profiles', 'deleted_at'), col('club_settings', 'mfa_required_from')],
  '0042': ['keep_history_on_account_delete', col('club_settings', 'mfa_required_from'), `exists (select 1 from pg_constraint where conname = 'profiles_id_fkey' and conrelid = to_regclass('public.profiles') and confdeltype = 'r')`],
  '0043': ['opponent_history', `exists (select 1 from pg_constraint where conname = 'profiles_id_fkey' and conrelid = to_regclass('public.profiles') and confdeltype = 'r')`, `to_regprocedure('public.opponent_history(uuid)') is not null`],
  '0044': ['club_documents', `to_regprocedure('public.opponent_history(uuid)') is not null`, `to_regclass('public.club_documents') is not null`],
  '0045': ['match_video', `to_regclass('public.club_documents') is not null`, col('events', 'video_url')],
  '0046': ['pinned_announcements', col('events', 'video_url'), col('announcements', 'pinned_at')],
  '0047': ['my_milestones', col('announcements', 'pinned_at'), `to_regprocedure('public.my_milestones()') is not null`],
  '0048': ['game_predictions', `to_regprocedure('public.my_milestones()') is not null`, `to_regclass('public.game_predictions') is not null`],
  '0049': ['season_leaders', `to_regclass('public.game_predictions') is not null`, `to_regprocedure('public.season_leaders(integer)') is not null`],
  '0050': ['no_direct_profile_delete', `to_regprocedure('public.season_leaders(integer)') is not null`, `not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_delete')`],
  '0051': ['scrub_deleted_account', `to_regclass('public.profiles') is not null and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_delete')`, `to_regprocedure('public.scrub_deleted_account(uuid)') is not null`],
  '0052': ['team_name_spaces', `to_regprocedure('public.opponent_history(uuid)') is not null`, `to_regprocedure('public.team_key(text)') is not null`],
  '0053': ['two_step_optional', col('club_settings', 'mfa_required_from'), `exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_settings' and column_name = 'mfa_required_from' and column_default is null)`],
  '0054': ['required_documents', col('club_settings', 'mfa_required_from'), col('club_settings', 'certificate_months')],
  '0055': ['league_game_stats', `to_regclass('public.league_matches') is not null and to_regprocedure('public.team_key(text)') is not null`, `to_regclass('public.league_goals') is not null`],
  '0056': ['fantahockey', `to_regclass('public.league_goals') is not null and to_regclass('public.game_predictions') is not null`, `to_regclass('public.fanta_picks') is not null`],
  '0057': ['fantahockey_own_groups', `to_regclass('public.fanta_picks') is not null`, `to_regprocedure('public.fanta_scope(boolean)') is not null`],
  '0058': ['league_hidden_players', `to_regclass('public.league_goals') is not null and to_regprocedure('public.team_key(text)') is not null`, `to_regclass('public.league_hidden_players') is not null`],
  '0059': ['unanswered_until', `to_regprocedure('public.unanswered_people(integer)') is not null or to_regprocedure('public.unanswered_people(integer, timestamptz)') is not null`, `to_regprocedure('public.unanswered_people(integer, timestamptz)') is not null`],
}

mkdirSync(join(root, 'supabase/apply'), { recursive: true })
for (const [number, [name, needs, done]] of Object.entries(FILES)) {
  const migration = readFileSync(join(root, 'supabase/migrations', `${number}_${name}.sql`), 'utf8')
  const text = `-- Apply migration ${number} (${name}) to a Supabase project, from the SQL Editor.
-- Paste the whole file and run it once. It stops by itself, and changes nothing, when:
--   1. the project does not look like the club's project (the tables of the earlier migrations are missing), or
--   2. migration ${number} was already applied (a second run).
-- Run it on the TEST project first. Never on the club's live project before the production checklist is done.

do $guard$
begin
  if not (${needs}) then
    raise exception 'Wrong project, or an earlier migration is missing: migration ${number} was not applied.';
  end if;
  if ${done} then
    raise exception 'Migration ${number} is already applied: nothing was changed.';
  end if;
end
$guard$;

begin;

${migration.trim()}

commit;
`
  writeFileSync(join(root, 'supabase/apply', `apply_${number}_${name}.sql`), text)
  console.log(`wrote supabase/apply/apply_${number}_${name}.sql`)
}
