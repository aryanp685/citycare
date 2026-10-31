// CityCare DB bootstrap — the node-only equivalent of db-bootstrap.sh for
// machines without a psql client (macOS ships none). Same steps, same
// assertions; the SQL files in schema/ stay the single source of truth.
//
//   DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require" node scripts/db-bootstrap-node.mjs
//
//   FORCE_SCHEMA=1   re-apply the base SQL (citycare_init.sql is NOT idempotent — fresh DB only)
//   FORCE_SEED=1     truncate + reseed demo data
//   SCRYPT_N=4096    password cost for the seed (default 16384; Workers use 4096)
//
// Idempotent: schema is applied only when the tables are missing, demo data
// only when there are no users. Every step ASSERTS its result (no vacuous
// passes) — the output ends with "✔ database ready" or the process exits
// non-zero with the failed assertion.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "..");
const SCHEMA = path.resolve(WEB, "..", "schema");
const URL_ = process.env.DATABASE_URL ?? "postgres://citycare:citycare@127.0.0.1:5432/citycare";
process.env.DATABASE_URL = URL_; // seed.mjs reads the same variable

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
console.log(`▶ database: ${db.d} (PostgreSQL ${ver.server_version})`);

// 1) schema ───────────────────────────────────────────────────────────────────
const hasUser = (await q1(`select to_regclass('public."User"') is not null as has`)).has;
if (hasUser && process.env.FORCE_SCHEMA !== "1") {
  console.log("  schema: tables already present — skipping (FORCE_SCHEMA=1 to re-apply on a FRESH database)");
} else {
  for (const f of ["citycare_init.sql", "sql/constraints.sql", "sql/ledger.sql"]) {
    const sql = fs.readFileSync(path.join(SCHEMA, f), "utf8");
    await c.query(sql).catch((e) => die(`schema failed at ${f}: ${e.message}`));
    console.log(`  schema applied: ${f}`);
  }
}
// Migrations: numbered, idempotent SQL files, applied on every run in filename order.
const migDir = path.join(SCHEMA, "migrations");
if (fs.existsSync(migDir)) {
  for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(migDir, f), "utf8");
    await c.query(sql).catch((e) => die(`migration failed: ${f} — ${e.message}`));
    console.log(`  migration applied: ${f}`);
  }
}
// Managed proxies drop startup parameters, so pin the timezone + statement
// timeout at the database/role level too — and PROVE it on a brand-new
// session rather than trusting the ALTER (the shell script does the same).
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
const fresh = new pg.Client({ connectionString: URL_ });
await fresh.connect();
const TZ_NOW = (await fresh.query("show timezone")).rows[0].TimeZone;
await fresh.end();
if (TZ_NOW !== "UTC") die(`database timezone is '${TZ_NOW}', must be UTC`);

const tables = (await q1(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)).n;
const ledgerFn = (await q1(`select count(*)::int as n from pg_proc where proname in ('ledger_append','ledger_verify')`)).n;
const trigger = (await q1(`select count(*)::int as n from pg_trigger where tgname in ('audit_no_update','audit_no_delete')`)).n;
const partials = (await q1(`select count(*)::int as n from pg_indexes where indexname in ('one_live_appt_per_doctor_per_instant','one_token_per_doctor_per_day','one_active_consent_per_pair')`)).n;
if (tables < 25) die(`expected ≥ 25 tables, found ${tables}`);
if (ledgerFn !== 2) die(`ledger functions missing (${ledgerFn}/2)`);
if (trigger < 1) die("audit tamper trigger missing");
if (partials !== 3) die(`partial unique indexes missing (${partials}/3)`);
console.log(`  verified: ${tables} tables · ledger_append/verify · tamper trigger · 3 partial unique indexes · timezone=UTC`);

// 2) demo data ─────────────────────────────────────────────────────────────────
let users = (await q1(`select count(*)::int as n from "User"`)).n;
if (users !== 0 && process.env.FORCE_SEED !== "1") {
  console.log(`  seed: ${users} users already present — skipping (FORCE_SEED=1 wipes and re-seeds demo data)`);
} else {
  const seed = spawnSync(process.execPath, [path.join(WEB, "scripts", "seed.mjs")], {
    stdio: "inherit",
    env: process.env,
  });
  if (seed.status !== 0) die("seed.mjs failed");
}
users = (await q1(`select count(*)::int as n from "User"`)).n;
if (users < 9) die(`expected ≥ 9 users after seed, found ${users}`);
const cost = (await q1(`select string_agg(distinct split_part("passwordHash",'$',2), ',') as n from "User"`)).n;
const breaks = (await q1(`select count(*)::int as n from ledger_verify()`)).n;
if (breaks !== 0) die(`ledger_verify() reports ${breaks} breaks`);
const rows = (await q1(`select count(*)::int as n from "AuditLog" where seq is not null`)).n;
if (rows < 1) die("ledger is empty — verify() would pass vacuously");
console.log(`  verified: ${users} users (scrypt N=${cost}) · ledger ${rows} rows, 0 breaks`);
await c.end();
console.log("✔ database ready");
