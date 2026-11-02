// CityCare DB VERIFY — read-only schema verification for production builds (R1,
// 2026-11-02, P0 isolation remediation).
//
// This is the default (non-apply) production prebuild path: it PROVES the live
// database satisfies the invariants the code requires — the EXACT same checks
// the bootstrap asserts — using only SELECT/SHOW statements. It never executes
// DDL, never applies migrations, never alters the database or role, and never
// seeds. A production build therefore moves CODE, and only an explicit
// controlled migration operation (SCHEMA_SYNC_MODE=apply + MIGRATION_TARGET)
// moves the SCHEMA.
//
//   DATABASE_URL="postgresql://…" node scripts/db-verify-node.mjs
//
// Exit 0 = verified; exit 1 = missing URL, connection failure, or failed check.
import pg from "pg";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("✗ DATABASE_URL is not set — refusing (there is no implicit local fallback)");
  process.exit(1);
}
const URL_ = rawUrl;

const die = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

const c = new pg.Client({ connectionString: URL_ });
try {
  await c.connect();
} catch (e) {
  die(`cannot connect to DATABASE_URL — ${e.message}`);
}
const q1 = (sql) => c.query(sql).then((r) => r.rows[0]);

const db = await q1("select current_database() as d");
const ver = await q1("show server_version");
console.log(`▶ verify: ${db.d} (PostgreSQL ${ver.server_version}) — READ ONLY, no schema changes will be executed`);

// The same invariants the bootstrap asserts (all read-only here):
const tables = (await q1(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)).n;
const ledgerFn = (await q1(`select count(*)::int as n from pg_proc where proname in ('ledger_append','ledger_verify')`)).n;
const trigger = (await q1(`select count(*)::int as n from pg_trigger where tgname in ('audit_no_update','audit_no_delete')`)).n;
const partials = (await q1(`select count(*)::int as n from pg_indexes where indexname in ('one_live_appt_per_doctor_per_instant','one_token_per_doctor_per_day','one_active_consent_per_pair')`)).n;
if (tables < 25) die(`expected ≥ 25 tables, found ${tables}`);
if (ledgerFn !== 2) die(`ledger functions missing (${ledgerFn}/2)`);
if (trigger < 1) die("audit tamper trigger missing");
if (partials !== 3) die(`partial unique indexes missing (${partials}/3)`);

// Prove UTC on a brand-new session (the bootstrap pins it at the database/role
// level; verify only reads the result — it never ALTERs).
const fresh = new pg.Client({ connectionString: URL_ });
await fresh.connect();
const TZ_NOW = (await fresh.query("show timezone")).rows[0].TimeZone;
await fresh.end();
if (TZ_NOW !== "UTC") die(`database timezone is '${TZ_NOW}', must be UTC`);

await c.end();
console.log(`  verified: ${tables} tables · ledger_append/verify · tamper trigger · 3 partial unique indexes · timezone=UTC`);
console.log("[prebuild] verify: OK — read-only verification passed (0 DDL, 0 DML executed)");
