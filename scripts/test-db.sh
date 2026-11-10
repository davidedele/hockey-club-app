#!/usr/bin/env bash
# Runs the migrations and the access rule tests on a throwaway local Postgres.
# Needs the Postgres server binaries. Never connects to Supabase.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# PG_BIN can point at any Postgres bin folder. Otherwise look in the usual Linux and Homebrew places.
bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin 2>/dev/null | sort -V | tail -1 || true)}"
[ -x "$bin/initdb" ] || { echo "Postgres server binaries not found" >&2; exit 1; }

work="$(mktemp -d)"
sock="$work/sock"; mkdir "$sock"
run() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown -R postgres "$work" && chmod 755 "$work"
# The postgres user must be able to read the SQL files.
sql() { run "$bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$sock" -d postgres "$@"; }

run "$bin/initdb" -D "$work/data" -A trust >/dev/null
run "$bin/pg_ctl" -D "$work/data" -o "-k $sock -c listen_addresses=''" -l "$work/log" -w start >/dev/null
trap 'run "$bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1; rm -rf "$work"' EXIT

sql -f "$root/supabase/tests/00_shim.sql"
for f in "$root"/supabase/migrations/*.sql; do
  migration_name="$(basename "$f")"
  if [ "${TEST_CLUB_APPLY_FILES:-0}" = 1 ] && [[ "$migration_name" == 006[34]_* ]]; then
    handoff_file="$root/supabase/apply/apply_$migration_name"
    sql -f "$handoff_file"
    if repeat_result=$(sql -f "$handoff_file" 2>&1); then
      echo "Repeat guard failed for $migration_name" >&2; exit 1
    fi
    [[ "$repeat_result" == *"already applied"* ]] || { echo "$repeat_result" >&2; exit 1; }
  else
    sql -f "$f"
  fi
done
sql -f "$root/supabase/tests/01_helpers.sql"
for f in "$root"/supabase/tests/[0-9][0-9]_*.sql; do
  case "$(basename "$f")" in 00_*|01_*) continue ;; esac
  sql -o /dev/null -f "$f" 2>&1 | sed -E "s/^psql:[^ ]+ (NOTICE|ERROR): +//"
done
