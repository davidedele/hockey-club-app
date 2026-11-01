-- The catalogue audit: what the whole schema looks like, not one rule. It runs after all migrations.
\echo == catalogue
do $$
declare
  v_bad text;
begin
  -- 1. Every table of the app has row level security.
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_bad is not null then raise exception 'FAIL tables without row level security: %', v_bad; end if;
  raise notice 'ok   every table has row level security';

  -- 2. Every function that runs with its owner's rights has a fixed search path.
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig::text like '%search_path=%', false);
  if v_bad is not null then raise exception 'FAIL privileged functions without a fixed search path: %', v_bad; end if;
  raise notice 'ok   every privileged function has a fixed search path';

  -- 3. Nothing is open to signed out visitors beyond one harmless helper and the club's public name and colours.
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('pretty_name');
  if v_bad is not null then raise exception 'FAIL functions a signed out visitor can run: %', v_bad; end if;
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'select') and c.relname <> 'club_settings';
  if v_bad is not null then raise exception 'FAIL tables a signed out visitor can read: %', v_bad; end if;
  raise notice 'ok   signed out visitors reach nothing beyond the public club name and colours';

  -- 4. The personal data tables are never readable by anon, and the server only functions are not for signed in people.
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('certificates_due', 'certificates_mark_sent', 'reminders_due', 'reminders_mark_sent', 'announcements_due', 'announcements_mark_sent', 'event_notices_due', 'event_notices_mark_sent', 'notification_route', 'push_remove', 'calendar_events', 'league_details_pending', 'league_details_claim', 'league_details_finish', 'league_store_details')
    and has_function_privilege('authenticated', p.oid, 'execute');
  if v_bad is not null then raise exception 'FAIL server only functions a signed in person can run: %', v_bad; end if;
  raise notice 'ok   server only functions are not open to signed in people';
end $$;
\echo ALL CATALOGUE TESTS PASSED
