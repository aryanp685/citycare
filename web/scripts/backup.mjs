#!/usr/bin/env node
// NG-S09 — backup CLI. The SAME code path the Vercel cron uses (src/lib/backup-core.mjs),
// runnable from any machine that can reach the database:
//
//   node scripts/backup.mjs create     # take an encrypted backup into the configured store
//   node scripts/backup.mjs list       # recent attempts (metadata) + files in the store
//   node scripts/backup.mjs verify F   # decrypt + checksum a file WITHOUT restoring
//
// Env (process env wins over .env.local): DATABASE_URL, BACKUP_KEY (32-byte base64),
// and a store: BACKUP_DIR (local) and/or BLOB_READ_WRITE_TOKEN (Vercel blob, private).
// See web/docs/operations/BACKUP_CONFIGURATION.md.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadLocalEnv } from "./read-env-local.mjs";
import {
  BackupError,
  createBackup,
  recordBackupMeta,
  listBackupFiles,
  verifyBackupFile,
  backupKey,
  storeKind,
  dbFingerprintFromUrl,
  schemaVersionFromDir,
  formatBackupFatalLog,
} from "../src/lib/backup-core.mjs";
import { withCopySupport } from "../src/lib/pg-copy.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(here, "..", "..", "schema", "migrations");
const CMD = process.argv[2];

function die(msg, code = 1) {
  console.error(`backup: ${msg}`);
  process.exit(code);
}

loadLocalEnv(["DATABASE_URL", "BACKUP_KEY", "BACKUP_DIR", "BLOB_READ_WRITE_TOKEN", "BACKUP_RETENTION_DAYS"]);

if (!["create", "list", "verify"].includes(CMD)) {
  die("usage: node scripts/backup.mjs create | list | verify <file>");
}

const url = process.env.DATABASE_URL;
if (!url) die("DATABASE_URL is not set");

// Dedicated client, not the app pool (no 8 s statement_timeout), UTC session like the
// cron route, wrapped for the COPY protocol (pg 8.23 does not stream COPY by default).
const raw = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000, options: "-c timezone=UTC" });
const client = withCopySupport(raw);
const query = (text, params) => client.query(text, params);

try {
  try {
    await client.connect();
  } catch (e) {
    // DB unreachable ⇒ no backup AND no failure row possible (the audit row lives in the
    // same database). This stderr line is the only independent record of the failure.
    console.error(formatBackupFatalLog("db", "database connect failed: " + String(e?.message ?? e).slice(0, 120)));
    die("cannot connect to the database (class: db)", 1);
  }

  if (CMD === "create") {
    const kind = storeKind();
    if (!kind) die("no backup store configured: set BACKUP_DIR or BLOB_READ_WRITE_TOKEN (see BACKUP_CONFIGURATION.md)");
    const t0 = Date.now();
    const metaBase = {
      dbFingerprint: dbFingerprintFromUrl(url),
      storeKind: kind,
      schemaVersion: schemaVersionFromDir(MIGRATIONS_DIR),
    };
    try {
      const res = await createBackup({ query, client, url, migrationsDir: MIGRATIONS_DIR });
      await recordBackupMeta(query, {
        ...metaBase,
        pgVersion: String(res.header.pgVersion),
        status: "ok",
        fileSize: res.fileSize,
        sha256: res.sha256,
        objectName: res.objectName,
        durationMs: res.durationMs,
        errorClass: null,
        tableCount: Number(res.header.tableCount),
        rowCounts: Object.fromEntries(res.header.tables.map((t) => [t.name, t.rows])),
      });
      console.log(
        JSON.stringify(
          {
            ok: true,
            objectName: res.objectName,
            store: res.storeKind,
            fileSize: res.fileSize,
            sha256: res.sha256,
            tables: res.header.tableCount,
            rows: res.header.totalRows,
            schemaVersion: res.header.schemaVersion,
            durationMs: res.durationMs,
            pruned: res.pruned,
          },
          null,
          2,
        ),
      );
    } catch (e) {
      const code = e instanceof BackupError ? e.code : "unknown";
      // If the failure-row insert fails too (DB down / missing "Backup" table), the
      // platform log carries the only independent record — never swallowed silent.
      await recordBackupMeta(query, {
        ...metaBase,
        pgVersion: null,
        status: "failed",
        fileSize: 0,
        sha256: "",
        objectName: "",
        durationMs: Date.now() - t0,
        errorClass: code,
        tableCount: null,
        rowCounts: null,
      }).catch((e2) => {
        console.error(formatBackupFatalLog(code, "failure-row insert failed: " + String(e2?.message ?? e2).slice(0, 120)));
      });
      die(`${e.message} (class: ${code})`, 1);
    }
  }

  if (CMD === "list") {
    const meta = await query(
      `SELECT "createdAt","status","storeKind","objectName","fileSize","sha256","durationMs","errorClass","tableCount"
         FROM "Backup" ORDER BY "createdAt" DESC LIMIT 10`,
    );
    const files = await listBackupFiles({ BACKUP_DIR: process.env.BACKUP_DIR, BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN }).catch((e) => {
      if (e instanceof BackupError) return { unavailable: e.message };
      throw e;
    });
    console.log(JSON.stringify({ attempts: meta.rows, store: files }, null, 2));
  }

  if (CMD === "verify") {
    const file = process.argv[3];
    if (!file) die("usage: node scripts/backup.mjs verify <file>");
    const key = backupKey();
    if (!key) die("BACKUP_KEY is not set (32-byte base64)");
    const { readFileSync } = await import("node:fs");
    const v = verifyBackupFile(readFileSync(file), key);
    console.log(
      JSON.stringify(
        {
          ok: true,
          createdAt: v.header.createdAt,
          pgVersion: v.header.pgVersion,
          dbFingerprint: v.header.dbFingerprint,
          schemaVersion: v.header.schemaVersion,
          tables: v.header.tableCount,
          rows: v.header.totalRows,
          fileSha256: v.fileSha256,
          warning: v.header.warning ?? null,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await client.end().catch(() => null);
}
