#!/usr/bin/env node
// NG-S09 — restore drill / runbook executor. Restores an encrypted backup into a FRESH,
// isolated scratch database and verifies it — this is the code path of
// web/docs/operations/RESTORE_RUNBOOK.md, so the runbook and the drill cannot drift.
//
//   node scripts/restore-drill.mjs <backup-file> --scratch citycare_drill_YYYYMMDD_HHMMSS \
//       [--verify-email ramesh@demo.in --verify-password city1234] \
//       [--verify-document <documentId>] [--keep]
//
// SAFETY INVARIANTS (do not weaken):
//   * the scratch DB name MUST match ^citycare_drill_\d{8}_\d{6}$ — restore can never be
//     pointed at a real database;
//   * the scratch DB must not already exist (refuses to clobber a previous drill);
//   * writes go ONLY to the scratch DB; the only operations on the main DB are
//     CREATE DATABASE / DROP DATABASE for the exact scratch name — and DROP runs only on
//     a scratch THIS invocation created (a refused "already exists" run never drops the
//     previous drill's --keep database);
//   * verification gates: file checksum → schema apply → FK-ordered COPY in ONE
//     transaction → ledger_verify()=0 → row counts match the manifest → login/record
//     check → (optional) document-level verify → THEN the scratch DB is dropped (unless
//     --keep) — cleanup happens on EVERY path, including failures (A81 + final technical
//     verification finding 3);
//   * --verify-document decrypts exactly ONE operator-selected document with the
//     application's own crypto (scripts/verify-document.ts, run in a child process that
//     only ever sees booleans/counts/timings — never plaintext); the drill itself never
//     touches document bytes.
//
// Env (process env wins over .env.local): DATABASE_URL, BACKUP_KEY, and for
// --verify-document: DOCUMENT_KEY or SESSION_SECRET (the helper loads them itself).
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
const verifyDocumentId = flag("--verify-document");
if (verifyDocumentId !== null && !/^[0-9a-fA-F-]{8,64}$/.test(verifyDocumentId)) {
  console.error(`restore-drill: refusing — --verify-document ${JSON.stringify(verifyDocumentId)} does not look like a document id`);
  process.exit(2);
}
const tStart = Date.now();

if (!/^citycare_drill_\d{8}_\d{6}$/.test(scratch)) {
  console.error(`restore-drill: refusing — scratch name ${JSON.stringify(scratch)} does not match citycare_drill_YYYYMMDD_HHMMSS`);
  process.exit(2);
}

loadLocalEnv(["DATABASE_URL", "BACKUP_KEY", "DOCUMENT_KEY", "SESSION_SECRET"]);
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

// Failure INSIDE the main try/catch: record + THROW so the finally block still drops the
// scratch DB and closes connections. (The old version called process.exit(1) directly,
// which skipped finally — a schema/COPY failure left an orphan scratch database behind.
// Fixed in the final technical verification, 2026-11-02.)
class DrillFail extends Error {
  constructor(why) {
    super(why);
    this.name = "DrillFail";
  }
}
function fail(why) {
  report.status = "failed";
  report.failure = why;
  throw new DrillFail(why);
}
/** Fail BEFORE any database resource exists (gate 1): nothing to clean up, exit directly. */
function failHard(why) {
  report.status = "failed";
  report.failure = why;
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

// ---- gate 1: the file itself (magic, GCM, payload sha, section integrity) ----
// (failHard here: no database resource exists yet, so there is nothing to clean up)
let v;
try {
  v = verifyBackupFile(fs.readFileSync(file), key);
} catch (e) {
  failHard(`backup file verification failed: ${e.message} (class: ${e instanceof BackupError ? e.code : "unknown"})`);
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
    failHard(`repo schema ${repoMax} is OLDER than the backup's ${v.header.schemaVersion} — update the checkout, do not restore stale data into an older schema`);
}

const admin = new pg.Client({ connectionString: url });
let db = null;
let createdScratch = false; // gate the DROP: never drop a database this run did not create
try {
  await admin.connect();
  const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [scratch]);
  if (exists.rows.length) fail(`scratch database ${scratch} already exists — refusing to clobber a previous drill`);
  await admin.query(`CREATE DATABASE ${quoteIdent(scratch)}`);
  createdScratch = true;
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

  // ---- gate 5b: CONTENT — re-COPY every table and compare the EXACT MULTINET of rows.
  //      Row counts alone cannot catch corrupted cell data (the 2026-11-01 drill caught
  //      NUL bytes inside UUIDs where every row count still matched).
  //
  //      We compare the SORTED row multiset, NOT the raw byte sequence. COPY TO emits rows in
  //      physical (heap) order, and a restore into a fresh scratch DB generally has a different
  //      physical layout than the live table it came from (page packing, free-space reuse,
  //      TOAST, prior UPDATE/DELETE churn), so the raw text order is NOT a valid invariant —
  //      a byte-for-byte full-text compare produced a FALSE FAILURE on a perfectly correct
  //      restore (2026-11-02: identical row set + identical total bytes, only physical row
  //      order differed, so the gate went red). The exact multiset of rows IS the invariant:
  //      any corrupted cell, flipped bit, NUL byte, missing row, or extra row changes it,
  //      while legitimate re-ordering does not. (A88.)
  const tContent = Date.now();
  const contentMismatches = [];
  // COPY text format: one physical row per line (embedded newlines are escaped as \n), so
  // splitting on \n yields exactly the row set. Sort makes the compare order-independent.
  const sortedRows = (t) => t.split("\n").filter((l) => l.length > 0).sort();
  for (const s of v.sections) {
    const parts = [];
    await copyTableOut(db, s.name, (c) => parts.push(c));
    const text = Buffer.concat(parts).toString("utf8");
    const found = sortedRows(text);
    const expected = sortedRows(s.copyText);
    if (found.length !== expected.length) {
      contentMismatches.push({ table: s.name, expectedRows: expected.length, foundRows: found.length, expectedBytes: s.copyText.length, foundBytes: text.length });
      continue;
    }
    for (let i = 0; i < found.length; i++) {
      if (found[i] !== expected[i]) {
        contentMismatches.push({ table: s.name, firstDiffRow: i, expectedBytes: s.copyText.length, foundBytes: text.length });
        break; // one mismatch per table is enough to flag it (and keeps the report small/PHI-safe)
      }
    }
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

  // ---- gate 7 (optional): DOCUMENT-LEVEL verification — decrypt ONE operator-selected
  //      document from the restored scratch DB with the application's own crypto.
  //      This is what a byte-identical COPY test does NOT prove: that a real document
  //      decrypts and matches its stored plaintext checksum (finding 3, 2026-11-02).
  //      The child process prints booleans/counts/timings only — never plaintext. ----
  if (verifyDocumentId) {
    const tDoc = Date.now();
    report.checks.documentVerify = await verifyOneDocument(verifyDocumentId, scratchUrl);
    report.measurements.documentVerifyMs = Date.now() - tDoc;
  }

  report.status =
    report.checks.ledgerVerify.ok &&
    report.checks.rowCounts.ok &&
    report.checks.contentMatch.ok &&
    (!verifyEmail || report.checks.login.ok) &&
    (!verifyDocumentId || (report.checks.documentVerify?.ok === true))
      ? "success"
      : "failed";
  report.measurements.restoreMs = Date.now() - tStart; // full RTO proxy: file → verified scratch DB
} catch (e) {
  if (!(e instanceof DrillFail)) {
    report.status = "failed";
    report.failure = `restore failed: ${e.message}`;
  }
  // (DrillFail already recorded report.failure via fail())
} finally {
  if (db) await db.end().catch(() => null);
  if (createdScratch && !keep) {
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

/** Gate 7: run scripts/verify-document.ts in a CHILD process against the scratch DB.
 *  The child is the only component that ever holds a decrypted document — and even it
 *  prints only booleans/counts/timings. Plain node runs the .ts helper via built-in type
 *  stripping (Node ≥ 22.18); older runtimes fall back to tsx (a devDependency). Any runner
 *  problem is a verification FAILURE, never a crash-without-report (A81 discipline). */
async function verifyOneDocument(documentId, scratchUrl) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const cwd = path.join(REPO, "web");
  const env = { ...process.env, SCRATCH_DATABASE_URL: scratchUrl };
  // The child always prints its verdict JSON to stdout BEFORE exiting — so a non-zero
  // exit (not_found, tombstone, decrypt_failed) still carries a parseable verdict in
  // e.stdout. Only a runner problem (TS not strippable, crash before the verdict) is an
  // error-class result. A verification PROBLEM must never look like a restore crash.
  const parseVerdict = (stdout) => {
    const line = String(stdout ?? "").trim().split("\n").pop() ?? "";
    try {
      const j = JSON.parse(line);
      return typeof j?.ok === "boolean" ? j : null;
    } catch {
      return null;
    }
  };
  const runnerFailed = (e) => ({
    ok: false,
    found: false,
    errorClass: "verify_runner_failed",
    detail: String(e?.stderr ?? e?.message ?? "").slice(0, 200),
    ms: 0,
  });
  let r;
  try {
    r = await run(process.execPath, ["scripts/verify-document.ts", documentId], { cwd, env, maxBuffer: 4 * 1024 * 1024, timeout: 60_000 });
  } catch (e) {
    const v = parseVerdict(e?.stdout);
    if (v) return v; // a legitimate failed verdict despite exit 1
    const msg = String(e?.stderr ?? e?.message ?? "");
    if (!/Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION|Unexpected (token|identifier)/.test(msg)) return runnerFailed(e);
    try {
      r = await run("npx", ["tsx", "scripts/verify-document.ts", documentId], { cwd, env, maxBuffer: 4 * 1024 * 1024, timeout: 120_000 });
    } catch (e2) {
      const v2 = parseVerdict(e2?.stdout);
      return v2 ?? runnerFailed(e2);
    }
  }
  const j = parseVerdict(r.stdout);
  if (!j) return { ok: false, found: false, errorClass: "verify_runner_malformed", ms: 0 };
  return j;
}

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
