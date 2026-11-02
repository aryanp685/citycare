// NG-S09 — backup / disaster-recovery core.
//
// Framework-agnostic pure JS so the EXACT same file runs under plain node (CLI scripts),
// vitest, and Next (cron route, health endpoint) with zero transpilation. Types for the
// TS side live in the sibling backup-core.d.mts.
//
// WHY A LOGICAL DUMP BUILT THIS WAY
//   Neither Vercel serverless nor the sandbox has pg_dump/pg_restore, and `pg` 8.23's
//   Client has no dump()/restore() methods (verified at runtime, 2026-11-01). CityCare's
//   schema is 100% source-controlled (schema/*.sql + migrations, drift-guarded by the
//   prebuild hook, A76) — so:
//     schema = rebuilt from the repo SQL files at restore time (deterministic)
//     data   = SQL COPY text per public table, in FK order, over the wire (pooler-safe)
//   The dump is packaged into a versioned container (magic CCB1), checksummed, and
//   encrypted with AES-256-GCM under BACKUP_KEY (32-byte base64).
//   See web/docs/operations/ for the architecture, runbook, and drill report.
//
// SECURITY MODEL
//   * BACKUP_KEY is never derived from SESSION_SECRET (key separation: losing one does not
//     lose the other), never stored in the container, the "Backup" metadata table, or any
//     response payload.
//   * File layout:  MAGIC(4B "CCB1") | nonce(12B) | ciphertext | GCM tag(16B)
//   * Container:    header JSON (one line) + "\n" + payload (one section per table)
//   * header.payloadSha256 covers the payload; GCM covers the whole container; the
//     encrypted file's sha256 is recorded in the metadata table (store-side integrity).
//   * Section boundaries are NOT parsed by pattern: the manifest stores each section's exact
//     byte length, and the verifier checks the exact marker bytes + lengths in sequence.
//     A data row whose text happens to look like a marker can never misalign the dump.
//   * Metadata rows and all response payloads carry no patient data (the db identity is a
//     sha256 of host:port/database, credentials excluded).
//   * The blob store (when used) is private access; the local store writes 0600 files.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Container magic. Bump + FORMAT_VERSION on any format change; old files stay verifiable
 *  only if the version branch is kept (currently only v1 exists). */
export const FORMAT_MAGIC = "CCB1";
export const FORMAT_VERSION = 1;
export const DEFAULT_RETENTION_DAYS = 30;
/** Stay under Vercel's 30 s function ceiling with headroom. Hit ⇒ no partial file, 'time_budget'. */
export const DEFAULT_SOFT_LIMIT_MS = 20_000;
/** A backup is "stale" for /api/health once older than 24 h + 6 h grace. */
export const BACKUP_STALE_MS = (24 + 6) * 3_600_000;

/** Error with a machine-readable class used for the metadata table's errorClass column.
 *  code ∈ 'config' | 'crypto' | 'verify' | 'store' | 'db' | 'time_budget'. */
export class BackupError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "BackupError";
    this.code = code;
    this.cause = cause;
  }
}

// ---------- configuration ----------

/** Validate BACKUP_KEY → 32-byte Buffer, or null when unset. Never derived from SESSION_SECRET. */
export function backupKey(env = process.env) {
  const raw = env.BACKUP_KEY;
  if (!raw) return null;
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new BackupError("config", "BACKUP_KEY must be 32 bytes base64");
  return k;
}

/** Store selection: blob (Vercel) wins when a token is present, else the local dir. */
export function storeKind(env = process.env) {
  if (env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (env.BACKUP_DIR) return "local";
  return null;
}

/** BACKUP_RETENTION_DAYS clamped to 1..365 (default 30). */
export function retentionDays(env = process.env) {
  const n = Number.parseInt(env.BACKUP_RETENTION_DAYS ?? String(DEFAULT_RETENTION_DAYS), 10);
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_DAYS;
  return Math.min(365, Math.max(1, n));
}

/** sha256 of "host:port/database" — identifies WHICH database a file belongs to, without credentials. */
export function dbFingerprintFromUrl(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    throw new BackupError("config", "DATABASE_URL is not a valid postgres URL");
  }
  return crypto.createHash("sha256").update(`${u.host}/${u.pathname.replace(/^\//, "")}`).digest("hex");
}

/** Max migration file stem in schema/migrations (e.g. "0006") — recorded in the backup header.
 *  The restore side applies the repo's files and aborts if the repo is OLDER than this.
 *  Returns null when the dir is absent (e.g. the Vercel function FS does not ship ../schema). */
export function schemaVersionFromDir(migrationsDir) {
  let names = [];
  try {
    names = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return null;
  }
  if (!names.length) return null;
  return names[names.length - 1].replace(/\.sql$/, "");
}

// ---------- table ordering (FK topological: parents before children) ----------

/** All public user tables, alphabetical (deterministic). */
export const TABLES_SQL = `
  SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
   ORDER BY c.relname`;

/** FK edges as quoted identifiers (child references parent). */
export const FK_EDGES_SQL = `
  SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent
    FROM pg_constraint
   WHERE contype = 'f'`;

export function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function unquote(q) {
  const s = String(q);
  return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s;
}

/** Kahn's algorithm with alphabetical tie-break (deterministic output). A cycle (should not
 *  happen) appends the remainder alphabetically instead of failing — a backup is always
 *  possible; the header records warning:"fk_cycle" so it stays observable. */
export function topoTableOrder(tableNames, edges) {
  const indeg = new Map(tableNames.map((t) => [t, 0]));
  const children = new Map(tableNames.map((t) => [t, []]));
  for (const { child, parent } of edges) {
    const c = unquote(child);
    const p = unquote(parent);
    if (c === p) continue; // self-referencing FK — COPY into the same table is fine
    if (!indeg.has(c) || !indeg.has(p)) continue;
    children.get(p).push(c);
    indeg.set(c, indeg.get(c) + 1);
  }
  const ready = tableNames.filter((t) => indeg.get(t) === 0).sort();
  const out = [];
  while (ready.length) {
    const t = ready.shift();
    out.push(t);
    for (const c of children.get(t).sort()) {
      indeg.set(c, indeg.get(c) - 1);
      if (indeg.get(c) === 0) ready.push(c);
    }
    ready.sort();
  }
  let warning = null;
  if (out.length !== tableNames.length) {
    for (const t of tableNames.sort()) if (!out.includes(t)) out.push(t);
    warning = "fk_cycle";
  }
  return { order: out, warning };
}

// ---------- crypto (AES-256-GCM, same shape as document storage) ----------

/** Encrypt a container → file buffer: MAGIC(4) | nonce(12) | ciphertext | tag(16). */
export function encryptContainer(container, key) {
  if (!key || key.length !== 32) throw new BackupError("config", "BACKUP_KEY must be 32 bytes");
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(container), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(FORMAT_MAGIC, "latin1"), nonce, ct, tag]);
}

/** Decrypt + GCM-authenticate a file buffer → container. Throws verify on any tamper. */
export function decryptContainer(file, key) {
  if (file.length < 4 + 12 + 16 || file.subarray(0, 4).toString("latin1") !== FORMAT_MAGIC)
    throw new BackupError("verify", "not a CityCare backup file (bad magic or length)");
  const nonce = file.subarray(4, 16);
  const tag = file.subarray(file.length - 16);
  const ct = file.subarray(16, file.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch (e) {
    throw new BackupError("verify", "GCM authentication failed (wrong key or file modified)", e);
  }
}

// ---------- container build / verify ----------

/** Build the plaintext container from per-table COPY text (in restore order).
 *  @param {object} opts { createdAt, pgVersion, dbFingerprint, schemaVersion,
 *    tables: [{name, rows, copyText}], warning? } */
export function buildContainer(opts) {
  const sections = [];
  const manifest = [];
  let totalRows = 0;
  opts.tables.forEach((t, i) => {
    const marker = `===TABLE ${i}===\n`;
    const section = Buffer.concat([Buffer.from(marker, "latin1"), Buffer.from(t.copyText ?? "", "utf8")]);
    sections.push(section);
    manifest.push({ name: t.name, quoted: quoteIdent(t.name), rows: t.rows, bytes: section.length });
    totalRows += t.rows;
  });
  const payload = Buffer.concat(sections);
  const header = {
    magic: FORMAT_MAGIC,
    version: FORMAT_VERSION,
    createdAt: opts.createdAt,
    pgVersion: opts.pgVersion,
    dbFingerprint: opts.dbFingerprint,
    schemaVersion: opts.schemaVersion,
    tableCount: opts.tables.length,
    totalRows,
    payloadBytes: payload.length,
    payloadSha256: crypto.createHash("sha256").update(payload).digest("hex"),
    tables: manifest,
  };
  if (opts.warning) header.warning = opts.warning;
  const container = Buffer.concat([Buffer.from(JSON.stringify(header) + "\n", "utf8"), payload]);
  return { container, header, payloadBytes: payload.length };
}

function markerFor(i) {
  return `===TABLE ${i}===\n`;
}

/** Verify a decrypted container: header, payload sha256, then length-anchored section split.
 *  Any tamper (bit flip, section swap, truncated tail) throws BackupError("verify").
 *  @returns {{ header: object, sections: {name, quoted, rows, copyText}[] }} */
export function verifyContainer(container) {
  const s = container.toString("utf8");
  const nl = s.indexOf("\n");
  if (nl < 0) throw new BackupError("verify", "missing container header");
  let header;
  try {
    header = JSON.parse(s.slice(0, nl));
  } catch (e) {
    throw new BackupError("verify", "unparseable container header", e);
  }
  if (header.magic !== FORMAT_MAGIC) throw new BackupError("verify", "bad magic in header");
  if (header.version !== FORMAT_VERSION) throw new BackupError("verify", `unsupported container version ${header.version}`);
  const payload = Buffer.from(s.slice(nl + 1), "utf8");
  const got = crypto.createHash("sha256").update(payload).digest("hex");
  if (typeof header.payloadSha256 !== "string" || got !== header.payloadSha256)
    throw new BackupError("verify", "payload sha256 mismatch");
  if (!Array.isArray(header.tables) || header.tables.length !== header.tableCount)
    throw new BackupError("verify", "manifest length mismatch");
  if (header.tables.length === 0) throw new BackupError("verify", "empty table manifest");
  const sections = [];
  let off = 0;
  for (let i = 0; i < header.tables.length; i++) {
    const entry = header.tables[i];
    const marker = Buffer.from(markerFor(i), "latin1");
    if (off + entry.bytes > payload.length || entry.bytes < marker.length)
      throw new BackupError("verify", `section ${i} length exceeds payload`);
    if (!payload.subarray(off, off + marker.length).equals(marker))
      throw new BackupError("verify", `section ${i} marker mismatch at offset ${off}`);
    const body = payload.subarray(off + marker.length, off + entry.bytes);
    sections.push({ name: entry.name, quoted: entry.quoted, rows: entry.rows, copyText: body.toString("utf8") });
    off += entry.bytes;
  }
  if (off !== payload.length) throw new BackupError("verify", `payload tail of ${payload.length - off} bytes after last section`);
  return { header, sections };
}

/** Full file verification: magic + GCM decrypt + container checks.
 *  @returns {{ header, sections, fileSha256 }} */
export function verifyBackupFile(file, key) {
  const buf = Buffer.isBuffer(file) ? file : Buffer.from(file);
  const container = decryptContainer(buf, key);
  const parsed = verifyContainer(container);
  return { ...parsed, fileSha256: crypto.createHash("sha256").update(buf).digest("hex") };
}

// ---------- file naming ----------

/** citycare-backup-<UTC compact timestamp>-<first 8 hex of the file sha256>.ccbk
 *  (all-lowercase so the store's object-name regex admits it; sortable by name). */
export function backupFileName(createdAt, fileSha256) {
  const compact = createdAt.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\.\d{3}Z$/, "");
  return `citycare-backup-${compact}-${fileSha256.slice(0, 8)}.ccbk`;
}

// ---------- stores (local dir | Vercel blob) ----------

function localDir(env) {
  const dir = env.BACKUP_DIR;
  if (!dir) throw new BackupError("store", "BACKUP_DIR not set (local store)");
  return fs.promises.mkdir(dir, { recursive: true }).then(() => dir);
}

async function blobApi(env) {
  if (!env.BLOB_READ_WRITE_TOKEN) throw new BackupError("store", "BLOB_READ_WRITE_TOKEN not set (blob store)");
  try {
    // lazy: the sandbox never needs the SDK; production (Vercel) always has it installed
    return await import("@vercel/blob");
  } catch (e) {
    throw new BackupError("store", "@vercel/blob unavailable", e);
  }
}

/** Write the encrypted file to the configured store. Local writes are atomic (tmp+rename),
 *  fsynced, 0600. Blob objects are private. */
export async function writeBackupFile(env, objectName, file) {
  if (!/^[a-z0-9][a-z0-9-]*\.ccbk$/.test(objectName)) throw new BackupError("store", "bad object name");
  const kind = storeKind(env);
  if (kind === "blob") {
    const blob = await blobApi(env);
    try {
      await blob.put(objectName, new Blob([file]), { access: "private" }); // backups are NEVER public
    } catch (e) {
      throw new BackupError("store", "blob put failed", e);
    }
    return;
  }
  if (kind === "local") {
    const dir = await localDir(env);
    const finalPath = path.join(dir, objectName);
    const tmp = path.join(dir, `.${objectName}.tmp-${crypto.randomBytes(4).toString("hex")}`);
    try {
      const fd = await fs.promises.open(tmp, "w", 0o600);
      try {
        await fd.writeFile(file);
        await fd.sync();
      } finally {
        await fd.close();
      }
      await fs.promises.rename(tmp, finalPath);
    } catch (e) {
      await fs.promises.rm(tmp, { force: true }).catch(() => null);
      throw new BackupError("store", "local write failed", e);
    }
    return;
  }
  throw new BackupError("store", "no store configured (need BACKUP_DIR or BLOB_READ_WRITE_TOKEN)");
}

export async function readBackupFile(env, objectName) {
  const kind = storeKind(env);
  if (kind === "blob") {
    const blob = await blobApi(env);
    const res = await blob.get(objectName);
    return Buffer.from(await res.arrayBuffer());
  }
  if (kind === "local") {
    const dir = await localDir(env);
    try {
      return await fs.promises.readFile(path.join(dir, objectName));
    } catch (e) {
      throw new BackupError("store", "local read failed", e);
    }
  }
  throw new BackupError("store", "no store configured");
}

/** @returns {{name, size, mtimeMs}[]} */
export async function listBackupFiles(env) {
  const kind = storeKind(env);
  if (kind === "blob") {
    const blob = await blobApi(env);
    const items = await blob.list();
    return items
      .map((it) => {
        const name = typeof it.name === "string" ? it.name : String(it.url).split("/").pop() || "";
        return { name, size: Number(it.size ?? 0), mtimeMs: Date.parse(it.lastModified ?? "") || 0 };
      })
      .filter((e) => e.name.endsWith(".ccbk"));
  }
  if (kind === "local") {
    const dir = await localDir(env);
    const names = await fs.promises.readdir(dir);
    const out = [];
    for (const n of names) {
      if (!n.endsWith(".ccbk")) continue;
      const st = await fs.promises.stat(path.join(dir, n));
      out.push({ name: n, size: st.size, mtimeMs: st.mtimeMs });
    }
    return out;
  }
  throw new BackupError("store", "no store configured");
}

/** Delete files older than the retention window. ALWAYS keeps the newest file whatever its
 *  age (a long cron outage must not prune the only backup). Returns the deleted names. */
export async function pruneBackups(env, keepDays, nowMs = Date.now()) {
  const kind = storeKind(env);
  const entries = (await listBackupFiles(env)).sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (entries.length <= 1) return [];
  const cutoff = nowMs - keepDays * 86_400_000;
  const deleted = [];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].mtimeMs >= cutoff) continue; // within the window — keep (newer ones all precede)
    if (kind === "blob") {
      const blob = await blobApi(env);
      await blob.delete(entries[i].name);
    } else {
      const dir = await localDir(env);
      await fs.promises.rm(path.join(dir, entries[i].name), { force: true });
    }
    deleted.push(entries[i].name);
  }
  return deleted;
}

// ---------- COPY streaming (duck-typed pg client — no pg import) ----------

/** Stream COPY <t> TO STDOUT (text format). Empty tables produce no chunks.
 *  `client.query` must return an async iterable of text chunks (a pg Client does). */
export async function copyTableOut(client, name, onChunk) {
  const res = client.query(`COPY ${quoteIdent(name)} TO STDOUT WITH (FORMAT text)`);
  for await (const chunk of res) onChunk(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
}

/** COPY <t> FROM STDIN (text format) from an in-memory string.
 *  (node-pg pipes `values` as CopyData when the query ends in FROM STDIN.) */
export function copyTableIn(client, name, copyText) {
  return client.query(`COPY ${quoteIdent(name)} FROM STDIN WITH (FORMAT text)`, [copyText]);
}

// ---------- orchestration ----------

/** The single backup code path shared by the cron route and the CLI.
 *  All-or-nothing: if the soft time limit is hit mid-dump, NO file is written and a
 *  'time_budget' BackupError is thrown (callers record it in the metadata table).
 *  @param {object} opts { env?, query, client, url, migrationsDir?, softLimitMs?, now? }
 *  @returns {Promise<{objectName, fileSize, sha256, storeKind, header, durationMs, pruned}>} */
export async function createBackup(opts) {
  const env = opts.env ?? process.env;
  const key = backupKey(env);
  const kind = storeKind(env);
  const now = opts.now ?? new Date();
  const softLimitMs = opts.softLimitMs ?? DEFAULT_SOFT_LIMIT_MS;
  if (!key) throw new BackupError("config", "BACKUP_KEY is not set");
  if (!kind) throw new BackupError("config", "no backup store configured (BACKUP_DIR or BLOB_READ_WRITE_TOKEN)");
  const t0 = Date.now();

  const tablesRes = await opts.query(TABLES_SQL);
  const names = tablesRes.rows.map((r) => String(r.relname));
  if (!names.length) throw new BackupError("db", "no public tables found — refusing to back up an empty or foreign database");
  const edgesRes = await opts.query(FK_EDGES_SQL);
  const { order, warning } = topoTableOrder(
    names,
    edgesRes.rows.map((r) => ({ child: String(r.child), parent: String(r.parent) })),
  );
  const ver = await opts.query(`SELECT split_part(current_setting('server_version'), ' ', 1) AS v`);
  const pgVersion = String(ver.rows[0].v);
  const dbFingerprint = dbFingerprintFromUrl(opts.url);
  const schemaVersion = opts.migrationsDir ? schemaVersionFromDir(opts.migrationsDir) : null;

  const tables = [];
  for (const name of order) {
    if (Date.now() - t0 > softLimitMs)
      throw new BackupError("time_budget", `backup exceeded the ${softLimitMs} ms budget at table ${JSON.stringify(name)}; no partial file was written`);
    const cnt = await opts.query(`SELECT count(*)::int AS n FROM ${quoteIdent(name)}`);
    const chunks = [];
    await copyTableOut(opts.client, name, (c) => chunks.push(c));
    tables.push({ name, rows: Number(cnt.rows[0].n), copyText: Buffer.concat(chunks).toString("utf8") });
  }

  const { container, header } = buildContainer({
    createdAt: now.toISOString(),
    pgVersion,
    dbFingerprint,
    schemaVersion,
    tables,
    warning,
  });
  const file = encryptContainer(container, key);
  const sha256 = crypto.createHash("sha256").update(file).digest("hex");
  const objectName = backupFileName(now, sha256);
  await writeBackupFile(env, objectName, file);
  const pruned = await pruneBackups(env, retentionDays(env), now.getTime());
  return {
    objectName,
    fileSize: file.length,
    sha256,
    storeKind: kind,
    header,
    durationMs: Date.now() - t0,
    pruned,
  };
}

// ---------- "Backup" metadata table (see schema/migrations/0006_backup_metadata.sql) ----------

export const INSERT_BACKUP_META_SQL = `
  INSERT INTO "Backup" ("formatVersion","dbFingerprint","schemaVersion","pgVersion","fileSize","sha256","storeKind","objectName","status","durationMs","errorClass","tableCount","rowCounts")
  VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
  RETURNING id, "createdAt"`;

export const LATEST_GOOD_BACKUP_SQL = `
  SELECT "createdAt", "objectName", "storeKind", "fileSize", "sha256", "formatVersion"
    FROM "Backup"
   WHERE status = 'ok'
   ORDER BY "createdAt" DESC
   LIMIT 1`;

/** Record one attempt. status: 'ok' | 'failed' | 'partial'; errorClass only on non-ok rows.
 *  Carries no patient data. */
export async function recordBackupMeta(query, row) {
  const res = await query(INSERT_BACKUP_META_SQL, [
    row.dbFingerprint,
    row.schemaVersion,
    row.pgVersion,
    row.fileSize,
    row.sha256,
    row.storeKind,
    row.objectName,
    row.status,
    row.durationMs,
    row.errorClass,
    row.tableCount,
    row.rowCounts ? JSON.stringify(row.rowCounts) : null,
  ]);
  return { id: String(res.rows[0].id), createdAt: String(res.rows[0].createdAt) };
}

/** Staleness fact for /api/health: stale once older than BACKUP_STALE_MS (or never taken). */
export function backupStaleness(lastSuccessAt, nowMs = Date.now()) {
  if (!lastSuccessAt) return { lastSuccessAt: null, ageMs: null, stale: true };
  const t = Date.parse(lastSuccessAt);
  if (!Number.isFinite(t)) return { lastSuccessAt: null, ageMs: null, stale: true };
  const ageMs = nowMs - t;
  return { lastSuccessAt: new Date(t).toISOString(), ageMs, stale: ageMs > BACKUP_STALE_MS };
}
