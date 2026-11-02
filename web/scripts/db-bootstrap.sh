#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Bring a hosted Postgres (Neon / Supabase / any PG ≥ 15 with pgcrypto) to the
#  exact state the app expects. Shared by the Vercel and Cloudflare deploy scripts.
#
#    DATABASE_URL=postgresql://…?sslmode=require bash scripts/db-bootstrap.sh
#
#  Idempotent: schema is applied only when the tables are missing, demo data only
#  when there are no users. Every step ASSERTS its result (no vacuous passes).
#    FORCE_SCHEMA=1  re-apply SQL (citycare_init.sql is not idempotent → fresh DB only)
#    FORCE_SEED=1    truncate + reseed demo data
#    SCRYPT_N        password cost for the seed (default 16384; Cloudflare uses 4096)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."
SCHEMA="$PWD/../schema"
[ -n "${DATABASE_URL:-}" ] || { echo "DATABASE_URL is not set" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql not found (apt install postgresql-client)" >&2; exit 1; }
export SCRYPT_N="${SCRYPT_N:-16384}"
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
q()   { psql "$DATABASE_URL" -X -tAc "$1"; }

# FINAL F1 FIX (2026-11-02): the direct bootstrap is LOOPBACK-ONLY, UNCONDITIONALLY
# (mirrored from the node bootstrap). No environment variable (SEED_CONTEXT or any
# other caller-controlled value) can authorize remote DDL from this entry point —
# a declared context is not proof of protected-workflow identity (D84). The only
# authorized remote-DDL path is the protected migration workflow's dedicated
# entry point (scripts/migration-apply-node.mjs), authorized by its GitHub
# environment secret scope + least-privilege migration role. Fires BEFORE the
# first psql — no connection, no probe.
DEST_CHECK="$(DATABASE_URL="$DATABASE_URL" node --input-type=module -e '
import { dbUrlIdentity } from "./src/lib/prebuild-gate-core.mjs";
const id = dbUrlIdentity(process.env.DATABASE_URL);
if (!id.ok) console.log("refuse " + id.reason);
else if (!id.loopback) console.log("refuse non-loopback destination (host: " + id.host + ") — the direct bootstrap is loopback-only, no env var authorizes remote DDL");
else console.log("ok " + id.host);')" || die "destination identity check crashed — refusing"
case "$DEST_CHECK" in
  refuse*) die "DATABASE_URL failed the destination identity check ($DEST_CHECK) — refusing before any connection (the only authorized remote-DDL path is the protected migration workflow)" ;;
esac
echo "▶ destination identity: $DEST_CHECK"

DBNAME="$(q 'select current_database()')" || die "cannot connect to DATABASE_URL"
PGVER="$(q 'show server_version')"
echo "▶ database: $DBNAME (PostgreSQL $PGVER)"

# 1) schema ────────────────────────────────────────────────────────────────────
HAS_USER="$(q "select to_regclass('public.\"User\"') is not null")"
if [ "$HAS_USER" = "t" ] && [ "${FORCE_SCHEMA:-0}" != "1" ]; then
  echo "  schema: tables already present — skipping (FORCE_SCHEMA=1 to re-apply on a FRESH database)"
else
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "$SCHEMA/citycare_init.sql"
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "$SCHEMA/sql/constraints.sql"
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "$SCHEMA/sql/ledger.sql"
  echo "  schema: applied citycare_init.sql + constraints.sql + ledger.sql"
fi
# The app treats naive timestamps as UTC. Node pins it per session; the Workers
# path cannot send startup options, so pin it at the database too — and PROVE it
# on a brand-new session rather than trusting the ALTER.
# migrations: numbered, idempotent SQL files applied on every run (a fresh DB gets init + all of them)
MIG="$SCHEMA/migrations"
if [ -d "$MIG" ]; then
  for f in "$MIG"/*.sql; do
    [ -e "$f" ] || continue
    psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" || die "migration failed: $(basename "$f")"
    echo "  migration applied: $(basename "$f")"
  done
fi

psql "$DATABASE_URL" -X -q -c "ALTER DATABASE \"$DBNAME\" SET timezone = 'UTC';" \
  || echo "  (ALTER DATABASE not permitted — set timezone=UTC on the database manually)"
TZ_NOW="$(q 'show timezone')"; [ "$TZ_NOW" = "UTC" ] || die "database timezone is '$TZ_NOW', must be UTC"
# A46: managed proxies (Neon, Supavisor, Hyperdrive) may drop pg's *startup* parameters, so the app's
# statement_timeout=8s silently became 0 (= wait forever, i.e. until the platform kills the function).
# A role can always alter its own defaults; new sessions pick them up on every provider.
psql "$DATABASE_URL" -X -q -c "ALTER ROLE CURRENT_USER SET statement_timeout = '8s'; ALTER ROLE CURRENT_USER SET timezone = 'UTC';" \
  || echo "  (ALTER ROLE not permitted — statement_timeout must be set on the connection instead)"
TABLES="$(q "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
LEDGER_FN="$(q "select count(*) from pg_proc where proname in ('ledger_append','ledger_verify')")"
TRIGGER="$(q "select count(*) from pg_trigger where tgname in ('audit_no_update','audit_no_delete')")"
PARTIALS="$(q "select count(*) from pg_indexes where indexname in ('one_live_appt_per_doctor_per_instant','one_token_per_doctor_per_day','one_active_consent_per_pair')")"
[ "$TABLES" -ge 25 ]   || die "expected ≥ 25 tables, found $TABLES"
[ "$LEDGER_FN" = "2" ] || die "ledger functions missing ($LEDGER_FN/2)"
[ "$TRIGGER" -ge 1 ]   || die "audit tamper trigger missing"
[ "$PARTIALS" = "3" ]  || die "partial unique indexes missing ($PARTIALS/3)"
echo "  verified: $TABLES tables · ledger_append/verify · tamper trigger · 3 partial unique indexes · timezone=UTC"

# 2) demo data ─────────────────────────────────────────────────────────────────
# NG-S14 (Day 2, strictly fail-closed) — demo-seed gate (single decision point in
# src/lib/demo-seed-core.mjs):
# seed   → ONLY RETENTION_POLICY=demo with SEED_DEMO unset or 1 (the synthetic demo env)
# skip   → SEED_DEMO=0 on a VERIFIED policy (schema-only is a valid state)
# refuse → real-data policy (internal/pilot) without SEED_DEMO=0; missing/invalid
#          RETENTION_POLICY (regardless of SEED_DEMO); or an invalid SEED_DEMO value
SEED_ACTION="$(node --input-type=module -e "import { resolveDemoSeedAction } from './src/lib/demo-seed-core.mjs'; const d = resolveDemoSeedAction(process.env); console.error('  seed gate: ' + d.action + ' — ' + d.reason + (d.warning ? ' (WARNING: ' + d.warning + ')' : '')); console.log(d.action);")"
if [ "$SEED_ACTION" = "refuse" ]; then
  die "demo-seed gate REFUSED the bootstrap (database left untouched) — see the 'seed gate' line above and web/docs/operations/DEMO_AND_PILOT_ENVIRONMENT_ISOLATION.md"
fi
if [ "$SEED_ACTION" = "skip" ]; then
  echo "  seed: SKIPPED by the demo-seed gate (SEED_DEMO=0) — no demo accounts, nothing truncated"
  echo "✔ database ready (schema only, no demo data — demo-seed gate: skip)"
  exit 0
fi

USERS="$(q 'select count(*) from "User"')"
if [ "$USERS" != "0" ] && [ "${FORCE_SEED:-0}" != "1" ]; then
  echo "  seed: $USERS users already present — skipping (FORCE_SEED=1 wipes and re-seeds demo data)"
else
  node scripts/seed.mjs | tail -3 | sed 's/^/  seed: /'
fi
USERS="$(q 'select count(*) from "User"')"; [ "$USERS" -ge 9 ] || die "expected ≥ 9 users after seed, found $USERS"
COST="$(q "select string_agg(distinct split_part(\"passwordHash\",'\$',2), ',') from \"User\"")"
BREAKS="$(q 'select count(*) from ledger_verify()')"; [ "$BREAKS" = "0" ] || die "ledger_verify() reports $BREAKS breaks"
ROWS="$(q 'select count(*) from "AuditLog" where seq is not null')"; [ "$ROWS" -ge 1 ] || die "ledger is empty — verify() would pass vacuously"
echo "  verified: $USERS users (scrypt N=$COST) · ledger $ROWS rows, 0 breaks"
echo "✔ database ready"
