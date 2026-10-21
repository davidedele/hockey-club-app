#!/usr/bin/env bash
# Runs the migrations and the access rule tests on a throwaway local Postgres.
# Needs the Postgres server binaries. Never connects to Supabase.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
bin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
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
for f in "$root"/supabase/migrations/*.sql; do sql -f "$f"; done
sql -f "$root/supabase/tests/01_helpers.sql"
for f in "$root"/supabase/tests/0[2-9]_*.sql; do
  sql -o /dev/null -f "$f" 2>&1 | sed -E "s/^psql:[^ ]+ (NOTICE|ERROR): +//"
done
