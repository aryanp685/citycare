// CityCare — migration apply: the PROTECTED MIGRATION WORKFLOW's DDL entry point
// (.github/workflows/migration.yml, apply step). Applies the idempotent schema
// chain (base SQL on a fresh database + all migrations in order) and asserts the
// schema invariants. It is DDL-ONLY: it has NO seed phase and NEVER TRUNCATEs —
// e2e 18.23 pins that fact against this file's source.
//
// SECURITY MODEL — stated honestly (D84, final F1 pass 2026-11-02):
//   This script does NOT authorize itself. Code alone CANNOT prove "I am running
//   inside the protected workflow": every environment variable it reads can be
//   set by a direct caller, so no variable is treated as workflow identity. The
//   ACTUAL authorization boundary is:
//     1. credential scope — MIGRATION_DATABASE_URL is a GitHub environment
//        secret (the `production` environment), held by a DEDICATED migration
//        credential, and is not available to Vercel runtime/preview
//        environments (owner-side GitHub configuration);
//     2. role privileges — the migration role carries only the privileges
//        migrations require; the runtime role has NO DDL/TRUNCATE privilege
//        (owner-side Neon configuration, verified locally with a scratch
//        least-privilege role by e2e 18.23f–g);
//     3. the workflow itself — manual dispatch only, production-environment
//        required reviewers (owner-configured), explicit main-reachable commit
//        SHA + newest migration target validated before any connection
//        (scripts/migration-validate-node.mjs), no-cancel concurrency.
//   What THIS script enforces (code-proven, ALL before any connection):
//   MIGRATION_DATABASE_URL is REQUIRED — there is deliberately NO fallback to
//   DATABASE_URL, so the runtime credential can never reach this DDL path
//   (credential scope IS the authorization — D84); the URL's identity is
//   validated and ONLY its host is logged (never credentials); MIGRATION_TARGET
//   is REQUIRED — omitting it does NOT mean "apply the whole migrations
//   directory", the release must name its newest migration explicitly; the
//   target must exist in schema/migrations of THIS checkout and be its newest
//   file; schema invariants are asserted after apply; no seed and no TRUNCATE,
//   ever.
//
//   A direct local invocation of this script is possible (it is a script); the
//   reason that is safe is 1+2 above: without the dedicated credential the
//   connection fails, and with the runtime credential the DDL is denied by the
//   role. That is the documented boundary — not a claim that the script is
//   unforgeable.
//
// Env (both REQUIRED — missing either is refused before any connection):
//   MIGRATION_DATABASE_URL — the DEDICATED migration credential (the workflow's
//     GitHub environment secret). Never falls back to DATABASE_URL.
//   MIGRATION_TARGET — the newest migration filename of the release commit
//     (e.g. 0007_dedup_observation_index.sql). No omitted-target mode.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "..");
const SCHEMA = path.resolve(WEB, "..", "schema");

// REQUIRED — the DEDICATED migration credential. Deliberately NO fallback to
// DATABASE_URL: this DDL path must never be reachable with the runtime
// credential (the credential-scope boundary, D84). The workflow injects the
// GitHub environment secret into the apply step's env.
const rawUrl = process.env.MIGRATION_DATABASE_URL ?? "";
if (!rawUrl.trim()) {
  console.error("✗ MIGRATION_DATABASE_URL (the dedicated migration credential) is not set — refusing before any connection. This tool does NOT fall back to DATABASE_URL: the runtime credential must never reach the workflow's DDL path (D84). The workflow injects the GitHub environment secret into the apply step's env.");
  process.exit(1);
}
const { dbUrlIdentity } = await import("../src/lib/prebuild-gate-core.mjs");
const dest = dbUrlIdentity(rawUrl);
if (!dest.ok) {
  console.error(`✗ MIGRATION_DATABASE_URL failed validation (${dest.reason}) — refusing before any connection`);
  process.exit(1);
}
console.log(`[migration-apply] destination host: ${dest.host} (MIGRATION_DATABASE_URL) — credentials never logged`);

// MIGRATION_TARGET is REQUIRED — omitting it does NOT mean "apply the whole
// migrations directory". The named target must be a real file of THIS
// checkout's schema/migrations and its NEWEST one — mirrors
// migration-validate-node.mjs so the apply step is safe even if the validate
// step is ever bypassed (defense in depth; all of this is before any
// connection).
const t = (process.env.MIGRATION_TARGET ?? "").trim();
const migDir = path.join(SCHEMA, "migrations");
const available = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort() : [];
if (t === "") {
  console.error(`✗ MIGRATION_TARGET is not set — refusing before any connection. No omitted-target mode: applying the entire migrations directory by omission is not permitted; the release operation must name its newest migration explicitly (newest in this checkout: ${available[available.length - 1] ?? "none"})`);
  process.exit(1);
}
if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(t) || !available.includes(t)) {
  console.error(`✗ MIGRATION_TARGET ${JSON.stringify(t)} is not a migration present in schema/migrations (available: ${available.join(", ") || "none"}) — refusing`);
  process.exit(1);
}
if (t !== available[available.length - 1]) {
  console.error(`✗ MIGRATION_TARGET ${t} is not the NEWEST migration (newest: ${available[available.length - 1]}) — refusing`);
  process.exit(1);
}
console.log(`[migration-apply] controlled migration operation: MIGRATION_TARGET=${t} — DDL only, NO seed phase, NO TRUNCATE, ever`);

const die = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

const c = new pg.Client({ connectionString: rawUrl });
try {
  await c.connect();
} catch (e) {
  die(`cannot connect to the migration destination — ${e.message}`);
}
const q1 = (sql) => c.query(sql).then((r) => r.rows[0]);

const db = await q1("select current_database() as d");
const ver = await q1("show server_version");
console.log(`▶ database: ${db.d} (PostgreSQL ${ver.server_version})`);

// 1) schema — base SQL only on a fresh database (NOT idempotent), migrations
//    always (every migration file is idempotent by construction).
const hasUser = (await q1(`select to_regclass('public."User"') is not null as has`)).has;
if (hasUser) {
  console.log("  schema: tables already present — skipping base SQL (it is not idempotent)");
} else {
  for (const f of ["citycare_init.sql", "sql/constraints.sql", "sql/ledger.sql"]) {
    const sql = fs.readFileSync(path.join(SCHEMA, f), "utf8");
    await c.query(sql).catch((e) => die(`schema failed at ${f}: ${e.message}`));
    console.log(`  schema applied: ${f}`);
  }
}
if (fs.existsSync(migDir)) {
  // t is required and required to be the newest file of this checkout, so
  // applying the sorted directory in order = applying exactly the chain up to
  // the named target (never beyond it, never an un-named "everything").
  for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(migDir, f), "utf8");
    await c.query(sql).catch((e) => die(`migration failed: ${f} — ${e.message}`));
    console.log(`  migration applied: ${f}`);
  }
}
try {
  await c.query(`ALTER DATABASE "${db.d}" SET timezone = 'UTC'`);
} catch {
  console.log("  (ALTER DATABASE not permitted — set timezone=UTC on the database manually)");
}
try {
  await c.query("ALTER ROLE CURRENT_USER SET statement_timeout = '8s'");
  await c.query("ALTER ROLE CURRENT_USER SET timezone = 'UTC'");
} catch {
  console.log("  (ALTER ROLE not permitted — statement_timeout must be set on the connection instead)");
}
const fresh = new pg.Client({ connectionString: rawUrl });
await fresh.connect();
const TZ_NOW = (await fresh.query("show timezone")).rows[0].TimeZone;
await fresh.end();
if (TZ_NOW !== "UTC") die(`database timezone is '${TZ_NOW}', must be UTC`);

// 2) invariants — the same assertions the verify step checks afterwards.
const tables = (await q1(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)).n;
const ledgerFn = (await q1(`select count(*)::int as n from pg_proc where proname in ('ledger_append','ledger_verify')`)).n;
const trigger = (await q1(`select count(*)::int as n from pg_trigger where tgname in ('audit_no_update','audit_no_delete')`)).n;
const partials = (await q1(`select count(*)::int as n from pg_indexes where indexname in ('one_live_appt_per_doctor_per_instant','one_token_per_doctor_per_day','one_active_consent_per_pair')`)).n;
if (tables < 25) die(`expected ≥ 25 tables, found ${tables}`);
if (ledgerFn !== 2) die(`ledger functions missing (${ledgerFn}/2)`);
if (trigger < 1) die("audit tamper trigger missing");
if (partials !== 3) die(`partial unique indexes missing (${partials}/3)`);
await c.end();
console.log(`[migration-apply] verified: ${tables} tables · ledger_append/verify · tamper trigger · 3 partial unique indexes · timezone=UTC`);
console.log("✔ migrations applied (DDL only — no seed, no truncate; the workflow's verify step re-checks read-only next)");
