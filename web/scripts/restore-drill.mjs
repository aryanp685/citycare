#!/usr/bin/env node
// NG-S09 — restore drill / runbook executor. Restores an encrypted backup into a FRESH,
// isolated scratch database and verifies it — this is the code path of
// web/docs/operations/RESTORE_RUNBOOK.md, so the runbook and the drill cannot drift.
//
//   node scripts/restore-drill.mjs <backup-file> --scratch citycare_drill_YYYYMMDD_HHMMSS \
//       [--verify-email ramesh@demo.in --verify-password city1234] [--keep]
//
// SAFETY INVARIANTS (do not weaken):
//   * the scratch DB name MUST match ^citycare_drill_\d{8}_\d{6}$ — restore can never be
//     pointed at a real database;
//   * the scratch DB must not already exist (refuses to clobber a previous drill);
//   * writes go ONLY to the scratch DB; the only operations on the main DB are
//     CREATE DATABASE / DROP DATABASE for the exact scratch name;
//   * verification gates: file checksum → schema apply → FK-ordered COPY in ONE
//     transaction → ledger_verify()=0 → row counts match the manifest → login/record
//     check → THEN the scratch DB is dropped (unless --keep).
//
// Env (process env wins over .env.local): DATABASE_URL, BACKUP_KEY.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadLocalEnv } from "./read-env-local.mjs";
import { BackupError, verifyBackupFile, backupKey, copyTableIn, copyTableOut, quoteIdent, schemaVersionFromDir } from "../src/lib/backup-core.mjs";
import { withCopySupport } from "../src/lib/pg-copy.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(here, "..", "..");
const SCHEMA = path.join(REPO, "schema");

// Must be defined at module top: verifyScrypt is a hoisted function called from the
// top-level flow BEFORE any lower declaration would have initialised (TDZ) — a const
// declared near the function at the bottom of this file throws "Cannot access before
// initialization" and its `catch` silently swallows it as "wrong password".
const SCRYPT_MAXMEM = 256 * 1024 * 1024; // keep in sync with src/lib/auth.ts

function usage() {
  console.error("usage: node scripts/restore-drill.mjs <backup-file> --scratch citycare_drill_YYYYMMDD_HHMMSS [--verify-email e --verify-password p] [--keep]");
  process.exit(2);
}

const args = process.argv.slice(2);
const file = args[0];
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const keep = args.includes("--keep");
if (!file || !flag("--scratch") || (flag("--verify-email") !== null) !== (flag("--verify-password") !== null)) usage();
const scratch = flag("--scratch");
const verifyEmail = flag("--verify-email");
const verifyPassword = flag("--verify-password");
const tStart = Date.now();

if (!/^citycare_drill_\d{8}_\d{6}$/.test(scratch)) {
  console.error(`restore-drill: refusing — scratch name ${JSON.stringify(scratch)} does not match citycare_drill_YYYYMMDD_HHMMSS`);
  process.exit(2);
}

loadLocalEnv(["DATABASE_URL", "BACKUP_KEY"]);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("restore-drill: DATABASE_URL is not set");
  process.exit(1);
}
const key = backupKey();
if (!key) {
  console.error("restore-drill: BACKUP_KEY is not set (32-byte base64)");
  process.exit(1);
}

const report = {
  file,
  fileSha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  scratchDb: scratch,
  checks: {},
  measurements: {},
};

function fail(why) {
  report.status = "failed";
  report.failure = why;
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

// ---- gate 1: the file itself (magic, GCM, payload sha, section integrity) ----
let v;
try {
  v = verifyBackupFile(fs.readFileSync(file), key);
} catch (e) {
  fail(`backup file verification failed: ${e.message} (class: ${e instanceof BackupError ? e.code : "unknown"})`);
}
report.checks.fileIntegrity = {
  ok: true,
  createdAt: v.header.createdAt,
  pgVersion: v.header.pgVersion,
  dbFingerprint: v.header.dbFingerprint,
  schemaVersion: v.header.schemaVersion,
  tables: v.header.tableCount,
  rows: v.header.totalRows,
  warning: v.header.warning ?? null,
};
report.measurements.backupAgeMs = Date.now() - Date.parse(v.header.createdAt); // RPO at drill time
report.measurements.fileBytes = fs.statSync(file).size;

// ---- schema files from the repo (the deterministic restore of the schema) ----
const baseFiles = ["citycare_init.sql", path.join("sql", "constraints.sql"), path.join("sql", "ledger.sql")];
const migDir = path.join(SCHEMA, "migrations");
const migrations = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort() : [];
const repoMax = schemaVersionFromDir(migDir);

// schemaVersion gate: the repo must not be OLDER than the backup (zero-padded prefixes compare)
if (v.header.schemaVersion && repoMax) {
  const b = Number(String(v.header.schemaVersion).slice(0, 4));
  const r = Number(String(repoMax).slice(0, 4));
  if (Number.isFinite(b) && Number.isFinite(r) && b > r)
    fail(`repo schema ${repoMax} is OLDER than the backup's ${v.header.schemaVersion} — update the checkout, do not restore stale data into an older schema`);
}

const admin = new pg.Client({ connectionString: url });
let db = null;
try {
  await admin.connect();
  const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [scratch]);
  if (exists.rows.length) fail(`scratch database ${scratch} already exists — refusing to clobber a previous drill`);
  await admin.query(`CREATE DATABASE ${quoteIdent(scratch)}`);
  report.measurements.createdDbMs = Date.now() - tStart;

  const scratchUrl = url.replace(/\/[^/]*$/, `/${scratch}`);
  // dedicated client (no app-pool statement_timeout) + COPY protocol support;
  // UTC exactly like the backup route, so timestamptz text renders identically
  db = withCopySupport(new pg.Client({ connectionString: scratchUrl, options: "-c timezone=UTC" }));
  await db.connect();

  // ---- gate 2: schema (base + migrations, in the canonical order) ----
  const tSchema = Date.now();
  for (const rel of [...baseFiles, ...migrations.map((m) => path.join("migrations", m))]) {
    const sqlText = fs.readFileSync(path.join(SCHEMA, rel), "utf8");
    await db.query(sqlText);
  }
  report.measurements.schemaMs = Date.now() - tSchema;
  report.checks.schema = { ok: true, files: baseFiles.length + migrations.length };

  // ---- gate 3: data — FK-ordered COPY in ONE transaction ----
  const tData = Date.now();
  await db.query("BEGIN");
  try {
    for (const s of v.sections) {
      await copyTableIn(db, s.name, s.copyText);
    }
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK").catch(() => null);
    throw e;
  }
  report.measurements.dataMs = Date.now() - tData;
  report.checks.dataCopied = { ok: true, sections: v.sections.length };

  // ---- gate 4: ledger integrity on the RESTORED database ----
  const breaks = await db.query(`SELECT count(*)::int AS n FROM ledger_verify()`);
  report.checks.ledgerVerify = { ok: breaks.rows[0].n === 0, breaks: breaks.rows[0].n };

  // ---- gate 5: row counts match the manifest (nothing lost, nothing extra) ----
  const rowMismatches = [];
  for (const s of v.sections) {
    const c = await db.query(`SELECT count(*)::int AS n FROM ${s.quoted}`);
    if (Number(c.rows[0].n) !== s.rows) rowMismatches.push({ table: s.name, expected: s.rows, found: Number(c.rows[0].n) });
  }
  report.checks.rowCounts = { ok: rowMismatches.length === 0, mismatches: rowMismatches };

  // ---- gate 5b: CONTENT — re-COPY every table and compare bytes with the manifest.
  //      Row counts alone cannot catch corrupted cell data (the 2026-11-01 drill caught
  //      NUL bytes inside UUIDs where every row count still matched). Same server +
  //      same row order + UTC ⇒ a faithful restore is byte-identical. ----
  const tContent = Date.now();
  const contentMismatches = [];
  for (const s of v.sections) {
    const parts = [];
    await copyTableOut(db, s.name, (c) => parts.push(c));
    const text = Buffer.concat(parts).toString("utf8");
    if (text !== s.copyText) contentMismatches.push({ table: s.name, expectedBytes: s.copyText.length, foundBytes: text.length });
  }
  report.measurements.contentMs = Date.now() - tContent;
  report.checks.contentMatch = { ok: contentMismatches.length === 0, mismatches: contentMismatches };

  // ---- gate 6: login + record check on the restored data ----
  if (verifyEmail) {
    const u = await db.query(`SELECT id, "passwordHash", email, role, status FROM "User" WHERE lower(email) = lower($1) LIMIT 1`, [verifyEmail]);
    const loginOk =
      u.rows.length === 1 &&
      verifyScrypt(u.rows[0].passwordHash, verifyPassword);
    const records = await db.query(
      `SELECT (SELECT count(*)::int FROM "Patient" WHERE "userId" = $1) AS patients,
              (SELECT count(*)::int FROM "Encounter" WHERE "patientId" IN (SELECT id FROM "Patient" WHERE "userId" = $1)) AS encounters,
              (SELECT count(*)::int FROM "Consent" WHERE "patientId" IN (SELECT id FROM "Patient" WHERE "userId" = $1)) AS consents`,
      [u.rows[0]?.id],
    );
    report.checks.login = { ok: !!loginOk, email: verifyEmail, records: u.rows.length ? records.rows[0] : null };
  }

  report.status =
    report.checks.ledgerVerify.ok && report.checks.rowCounts.ok && report.checks.contentMatch.ok && (!verifyEmail || report.checks.login.ok)
      ? "success"
      : "failed";
  report.measurements.restoreMs = Date.now() - tStart; // full RTO proxy: file → verified scratch DB
} catch (e) {
  fail(`restore failed: ${e.message}`);
} finally {
  if (db) await db.end().catch(() => null);
  if (!keep) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(scratch)} WITH (FORCE)`);
      report.scratchDropped = true;
    } catch (e) {
      report.scratchDropped = false;
      report.droppedError = e.message;
    }
  }
  await admin.end().catch(() => null);
}

// ALWAYS print the report (success, gate failure, or not) — a silent exit-1 is
// indistinguishable from a crash and defeats the evidence trail (drill 2026-11-01).
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "success" && report.scratchDropped !== false ? 0 : 1);

/** Verify a scrypt$N$r$p$salt$hash hash (the app's format, src/lib/auth.ts) in constant time.
 *  MUST mirror src/lib/auth.ts verifyPassword: in particular `maxmem` must be raised to
 *  SCRYPT_MAXMEM (256 MiB) — the default work factor is N=2^17 (128 MiB), which Node's
 *  scrypt refuses with the 32 MiB default and a `catch` would swallow as "wrong password".
 *  (SCRYPT_MAXMEM itself is declared at the top of the module — see the TDZ note there.) */
function verifyScrypt(stored, password) {
  try {
    const [tag, n, r, p, saltB64, hashB64] = String(stored).split("$");
    if (tag !== "scrypt") return false; // unknown format (incl. the '!' of erased users): never accept
    const salt = Buffer.from(saltB64, "base64");
    const want = Buffer.from(hashB64, "base64");
    const N = Number(n);
    if (!Number.isInteger(N) || N > 1 << 20) return false; // a corrupt/hostile N must not become a memory bomb
    const got = crypto.scryptSync(password, salt, want.length, { N, r: Number(r), p: Number(p), maxmem: SCRYPT_MAXMEM });
    return want.length === got.length && crypto.timingSafeEqual(want, got);
  } catch {
    return false; // malformed hash => reject, do not crash the drill
  }
}
