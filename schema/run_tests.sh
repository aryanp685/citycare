#!/usr/bin/env bash
# ============================================================
#  CityCare — one-command schema verification
#  Regenerates SQL from the Prisma schema, builds a clean
#  PostgreSQL database, applies it, then runs the smoke test
#  (does the product story work?) and the guardrail test
#  (do the safety rules actually hold?).
#
#  Usage:  ./run_tests.sh
#  Needs:  a running PostgreSQL reachable via DATABASE_URL
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

# --- prerequisites -------------------------------------------------------
# psql is not in PATH on some minimal images even when the server is present.
# Look it up under /usr/lib/postgresql/<ver>/bin before giving up.
if ! command -v psql >/dev/null 2>&1; then
  PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)"
  if [ -n "${PG_BIN}" ]; then
    export PATH="${PG_BIN}:${PATH}"
    echo "    (using psql from ${PG_BIN})"
  else
    echo "ERROR: psql not found."
    echo "  Debian/Ubuntu : sudo apt-get install -y postgresql && sudo pg_ctlcluster 17 main start"
    echo "  macOS         : brew install postgresql@16 && brew services start postgresql@16"
    exit 1
  fi
fi

: "${PGHOST:=localhost}"
: "${PGUSER:=citycare}"
: "${PGPASSWORD:=citycare}"
: "${PGDATABASE:=citycare}"
export PGHOST PGUSER PGPASSWORD PGDATABASE

echo "==> 1/5  validating prisma schema"
npx prisma validate

echo "==> 2/5  generating SQL from schema"
npx prisma migrate diff --from-empty \
  --to-schema-datamodel prisma/schema.prisma --script > citycare_init.sql
echo "      $(grep -c 'CREATE TABLE' citycare_init.sql) tables, \
$(grep -c 'CREATE INDEX' citycare_init.sql) indexes"

echo "==> 3/5  rebuilding clean database"
psql -d postgres -q -c "DROP DATABASE IF EXISTS ${PGDATABASE};" \
                  -c "CREATE DATABASE ${PGDATABASE} OWNER ${PGUSER};"
psql -q -v ON_ERROR_STOP=1 -f citycare_init.sql
psql -q -v ON_ERROR_STOP=1 -f sql/constraints.sql
psql -q -v ON_ERROR_STOP=1 -f sql/ledger.sql

echo "==> 4/5  smoke test (the product story end-to-end)"
psql -v ON_ERROR_STOP=1 -f smoke_test.sql

echo "==> 5/5  guardrail test (every block SHOULD error)"
psql -f gap_test.sql

echo ""
echo "All steps executed."
