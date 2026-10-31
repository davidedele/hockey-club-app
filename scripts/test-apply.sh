#!/usr/bin/env bash
# Checks the files in supabase/apply on a throwaway local Postgres: each one runs once on a database that
# has the earlier migrations, stops on a second run, and stops on a database that is not the club's.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin 2>/dev/null | sort -V | tail -1 || true)}"
[ -x "$bin/initdb" ] || { echo "Postgres server binaries not found" >&2; exit 1; }
work="$(mktemp -d)"; sock="$work/sock"; mkdir "$sock"
run() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown -R postgres "$work" && chmod 755 "$work"
psqlc() { run "$bin/psql" -X -q -h "$sock" "$@"; }
run "$bin/initdb" -D "$work/data" -A trust >/dev/null
run "$bin/pg_ctl" -D "$work/data" -o "-k $sock -c listen_addresses=''" -l "$work/log" -w start >/dev/null
trap 'run "$bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1; rm -rf "$work"' EXIT
fail=0
for f in "$root"/supabase/apply/apply_*.sql; do
  n="$(basename "$f" | sed -E 's/apply_([0-9]{4})_.*/\1/')"
  db="t$n"
  psqlc -d postgres -c "create database $db" >/dev/null
  psqlc -d "$db" -f "$root/supabase/tests/00_shim.sql" >/dev/null 2>&1  # the roles already exist from the first database
  for m in "$root"/supabase/migrations/*.sql; do
    [ "$(basename "$m" | cut -c1-4)" -ge "$n" ] && break
    psqlc -v ON_ERROR_STOP=1 -d "$db" -f "$m" >/dev/null
  done
  if psqlc -v ON_ERROR_STOP=1 -d "$db" -f "$f" >/dev/null 2>"$work/err1"; then echo "ok   $n applies on a project with the earlier migrations"; else echo "FAIL $n did not apply: $(cat "$work/err1")"; fail=1; fi
  if psqlc -v ON_ERROR_STOP=1 -d "$db" -f "$f" >/dev/null 2>"$work/err2"; then echo "FAIL $n ran a second time"; fail=1; elif grep -q "already applied" "$work/err2"; then echo "ok   $n stops by itself on a second run"; else echo "FAIL $n second run failed for another reason: $(cat "$work/err2")"; fail=1; fi
  psqlc -d postgres -c "create database w$n" >/dev/null
  if psqlc -v ON_ERROR_STOP=1 -d "w$n" -f "$f" >/dev/null 2>"$work/err3"; then echo "FAIL $n ran on an empty project"; fail=1; elif grep -q "Wrong project" "$work/err3"; then echo "ok   $n stops by itself on the wrong project"; else echo "FAIL $n wrong project failed for another reason: $(cat "$work/err3")"; fail=1; fi
done
exit $fail
